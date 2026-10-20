import Foundation

/// Tracks which server mode is running. Ports and the mode come from the lab config (`LabConfig`).
/// - local: the dev server on `share.port`.
/// - shared: `share.mode` is `cloudflare` and the bridge answers; the lab is started outside the app
///   (`npm run lab -- start`) and the app only observes it.
/// The modes share one Durable Object SQLite state and never run together.
@MainActor
final class LabServer {
  enum Mode { case local, shared }
  /// Reachability of the shared link; only meaningful in `.shared`.
  enum Health { case unknown, ok, degraded, down }

  /// True while this app session believes sharing is on. A dead bridge is a health failure, never a mode switch.
  private(set) var sharingIntent = false
  var mode: Mode { sharingIntent ? .shared : .local }
  private(set) var publicURL: URL?
  private(set) var agentEnabled = false
  private(set) var agentBusy = false
  private(set) var agentModel: String?
  private var localStartedAt: Date?
  private var localProcess: Process?

  private(set) var health: Health = .unknown
  private var consecutiveFailures = 0
  private var consecutiveSuccesses = 0
  private var lastLocalProbeFailed = false
  private var recoveryRuns: [Date] = []
  private var incidentAttempts = 0
  private var nextRecoveryAt = Date.distantPast
  private var recoveryExhausted = false
  private var userInitiated = false
  /// Bumped when a script starts or ends and on wake; results of probes started earlier are dropped.
  private var operationGeneration = 0
  private var recoverNotBefore = Date.distantPast
  private var lastPublicHost: String?
  /// Hosts of tunnels that were replaced while the app kept running.
  private(set) var oldTunnelHosts: Set<String> = []

  var onChange: (() -> Void)?
  /// Shared tunnel got a new host: (new URL, caused by a user action).
  var onTunnelChange: ((URL, Bool) -> Void)?

  /// Origin for local tabs in the current mode.
  var localOrigin: URL { mode == .shared ? LabConfig.sharedOrigin : LabConfig.homeURL }

  var homeURL: URL { localOrigin }

  private static let sharingUnavailable = "Sharing and agent switching from the app are not available; use `npm run lab -- start` and `npm run lab -- agent on|off`."

  /// Returns true when the mode changed.
  @discardableResult
  func refresh() async -> Bool {
    let previous = mode
    let generation = operationGeneration
    let before = (publicURL, agentEnabled, agentBusy, agentModel)
    let healthBefore = health
    var request = URLRequest(url: LabConfig.sharedOrigin.appendingPathComponent("api/agent/status"))
    request.timeoutInterval = 1.5
    request.cachePolicy = .reloadIgnoringLocalCacheData
    let result = try? await URLSession.shared.data(for: request)
    guard generation == operationGeneration else { return false }
    let url = readPublicURL()
    if let (data, response) = result,
      (response as? HTTPURLResponse)?.statusCode == 200,
      let status = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    {
      sharingIntent = LabConfig.cloudflareEnabled
      agentEnabled = status["enabled"] as? Bool ?? false
      agentBusy = status["busy"] as? Bool ?? false
      agentModel = status["model"] as? String
    } else {
      agentEnabled = false
      agentBusy = false
      agentModel = nil
    }
    if result == nil { sharingIntent = false }
    if sharingIntent {
      publicURL = url
    } else {
      publicURL = nil
      resetHealth()
      lastPublicHost = nil
    }
    var changedTunnel: URL?
    if sharingIntent, let url, let host = url.host {
      if let old = lastPublicHost, old != host {
        oldTunnelHosts.insert(old)
        changedTunnel = url
      }
      lastPublicHost = host
    }
    if previous != mode || healthBefore != health || before != (publicURL, agentEnabled, agentBusy, agentModel) { onChange?() }
    if let changedTunnel { onTunnelChange?(changedTunnel, userInitiated) }
    return previous != mode
  }

  // MARK: Health

  private func resetHealth() {
    health = .unknown
    consecutiveFailures = 0
    consecutiveSuccesses = 0
    lastLocalProbeFailed = false
    incidentAttempts = 0
    recoveryExhausted = false
  }

  /// A manual action (cloud button, start sharing) lets automatic recovery try again.
  func resetRecovery() {
    recoveryRuns = []
    incidentAttempts = 0
    nextRecoveryAt = .distantPast
    recoveryExhausted = false
  }

  /// After sleep the previous result is stale until the next check.
  func markStale() {
    guard sharingIntent else { return }
    operationGeneration &+= 1
    recoverNotBefore = Date().addingTimeInterval(15)
    consecutiveSuccesses = 0
    guard health != .down else { return }
    health = .degraded
    onChange?()
  }

  /// Probes the local app through the bridge and the public tunnel URL.
  func checkHealth() async {
    guard sharingIntent else { return }
    let generation = operationGeneration
    let session = URLSession(configuration: .ephemeral)
    defer { session.finishTasksAndInvalidate() }

    let localOK = await probe(LabConfig.sharedOrigin, timeout: 3, session: session)
    var ok = localOK
    if localOK {
      if let origin = publicURL {
        var components = URLComponents(url: origin, resolvingAgainstBaseURL: false)
        components?.path = "/"
        components?.queryItems = [URLQueryItem(name: "health", value: UUID().uuidString)]
        if let url = components?.url { ok = await probe(url, timeout: 8, session: session) } else { ok = false }
      } else {
        ok = false
      }
    }
    guard generation == operationGeneration else { return }

    let before = health
    lastLocalProbeFailed = !localOK
    if ok {
      consecutiveFailures = 0
      consecutiveSuccesses += 1
      if health == .unknown || consecutiveSuccesses >= 2 {
        health = .ok
        incidentAttempts = 0
        recoveryExhausted = false
      }
    } else {
      consecutiveSuccesses = 0
      consecutiveFailures += 1
      health = consecutiveFailures >= 3 ? .down : .degraded
    }
    if health != before { onChange?() }
  }

  private func probe(_ url: URL, timeout: TimeInterval, session: URLSession) async -> Bool {
    var request = URLRequest(url: url)
    request.timeoutInterval = timeout
    request.cachePolicy = .reloadIgnoringLocalCacheData
    guard let (_, response) = try? await session.data(for: request) else { return false }
    return (response as? HTTPURLResponse)?.statusCode == 200
  }

  /// Runs one recovery script when the link is down and the budget allows (3 runs per 15 min, backoff 30/60/120 s).
  /// Returns true when a script ran.
  @discardableResult
  func recoverIfNeeded() async -> Bool {
    guard sharingIntent, health == .down, !recoveryExhausted else { return false }
    let now = Date()
    guard now >= recoverNotBefore else { return false }
    recoveryRuns.removeAll { now.timeIntervalSince($0) > 15 * 60 }
    if recoveryRuns.count >= 3 {
      recoveryExhausted = true
      onChange?()
      return false
    }
    guard now >= nextRecoveryAt else { return false }

    recoveryRuns.append(now)
    incidentAttempts += 1
    nextRecoveryAt = Date().addingTimeInterval([30, 60, 120][min(incidentAttempts - 1, 2)])
    consecutiveSuccesses = 0
    await refresh()
    if recoveryRuns.count >= 3 && health == .down { onChange?() }
    return true
  }

  /// True after the budget ran out; the link stays down until a manual action.
  var recoveryGaveUp: Bool { recoveryExhausted || (health == .down && recoveryRuns.count >= 3) }

  /// Public URL of a named tunnel from the config (origin only).
  func readPublicURL() -> URL? {
    guard let host = LabConfig.configuredPublicURL?.host else { return nil }
    return URL(string: "https://\(host)/")
  }

  // MARK: Actions

  /// Starts the lab (`node scripts/lab.mjs start`: app + bridge, agent access off) when nothing answers in local mode.
  /// Ports and the data directory come from the lab config; nothing is shared and the agent is never enabled here.
  func ensureLocalServer() {
    guard mode == .local, LabConfig.shareMode == "local", localProcess?.isRunning != true else { return }
    if let localStartedAt, Date().timeIntervalSince(localStartedAt) < 60 { return }
    guard !LabConfig.projectDir.isEmpty, let node = LabConfig.nodePath else { return }
    let script = LabConfig.projectDir + "/scripts/lab.mjs"
    guard FileManager.default.fileExists(atPath: script) else { return }
    localStartedAt = Date()
    let process = Process()
    process.executableURL = URL(fileURLWithPath: node)
    process.arguments = [script, "start"]
    process.environment = LabConfig.childEnvironment(node: node)
    process.currentDirectoryURL = URL(fileURLWithPath: LabConfig.projectDir)
    process.standardInput = FileHandle.nullDevice
    process.standardOutput = FileHandle.nullDevice
    process.standardError = FileHandle.nullDevice
    do { try process.run(); localProcess = process } catch { localProcess = nil }
  }

  func startSharing(boardPath: String) async -> (ok: Bool, output: String) { (false, Self.sharingUnavailable) }

  func stopSharing() async -> (ok: Bool, output: String) { (false, Self.sharingUnavailable) }

  func setAgent(enabled: Bool) async -> (ok: Bool, output: String) { (false, Self.sharingUnavailable) }
}
