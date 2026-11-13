import Foundation

/// Mirrors the lab started by `node scripts/lab.mjs start` (app + bridge, and the share supervisor that
/// owns cloudflared). The app never probes or restarts the tunnel itself: it reads the supervisor's
/// `<data dir>/share/state.json` and switches the link with `lab share on|off|restart`, so there is one
/// owner of the backoff and of the link state.
/// - local: the link is off; tabs use the dev server on `share.port`.
/// - shared: the link is on; tabs use the bridge on `share.bridgePort`, the public entry point.
@MainActor
final class LabServer {
  enum Mode { case local, shared }
  /// Reachability of the shared link as reported by the supervisor; only meaningful in `.shared`.
  enum Health { case unknown, ok, degraded, down }

  private(set) var sharingIntent = false
  var mode: Mode { sharingIntent ? .shared : .local }
  /// The public origin; set only while the supervisor reports a working link.
  private(set) var publicURL: URL?
  private(set) var health: Health = .unknown
  private(set) var recoveryGaveUp = false
  /// Supervisor status (`starting`, `checking`, `ready`, `degraded`, `restarting`, `gave-up`) for tooltips.
  private(set) var shareStatus = "off"
  private(set) var shareError: String?
  private(set) var agentEnabled = false
  private(set) var agentBusy = false
  private(set) var agentModel: String?
  /// A user-started operation in progress (shown next to the buttons).
  private(set) var task: String?
  private var localStartedAt: Date?
  private var localProcess: Process?
  private var lastPublicHost: String?
  private var userInitiated = false
  /// The user turned sharing on in this app session and has not turned it off.
  private var wantsSharing = false
  /// Lab process that had sharing on; a different one with sharing off means the lab was restarted.
  private var sharingLabPid: Int32?
  private var restoringShare = false
  /// Hosts of tunnels that were replaced while the app kept running.
  private(set) var oldTunnelHosts: Set<String> = []

  var onChange: (() -> Void)?
  /// Shared tunnel got a new host: (new URL, caused by a user action).
  var onTunnelChange: ((URL, Bool) -> Void)?

  /// Origin for local tabs in the current mode.
  var localOrigin: URL { mode == .shared ? LabConfig.sharedOrigin : LabConfig.homeURL }
  var homeURL: URL { localOrigin }

  private struct Snapshot: Equatable {
    let publicURL: URL?, agentEnabled: Bool, agentBusy: Bool, agentModel: String?
    let health: Health, recoveryGaveUp: Bool, shareStatus: String, task: String?
  }
  private var snapshot: Snapshot {
    Snapshot(
      publicURL: publicURL, agentEnabled: agentEnabled, agentBusy: agentBusy, agentModel: agentModel,
      health: health, recoveryGaveUp: recoveryGaveUp, shareStatus: shareStatus, task: task)
  }

  private struct ShareState: Decodable {
    let status: String
    let linkReady: Bool
    let url: String?
    let lastError: String?
    let pid: Int32?
    let heartbeatAt: String?
  }

  /// The supervisor's state, or nil when no lab is running (missing file, dead process or stale heartbeat).
  private func readShareState() -> ShareState? {
    guard let data = try? Data(contentsOf: LabConfig.shareStateFile),
      let state = try? JSONDecoder().decode(ShareState.self, from: data),
      let pid = state.pid, kill(pid, 0) == 0 || errno == EPERM
    else { return nil }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let beat = state.heartbeatAt.flatMap(formatter.date(from:)), Date().timeIntervalSince(beat) < 60 else { return nil }
    return state
  }

  /// Returns true when the mode changed.
  @discardableResult
  func refresh() async -> Bool {
    let previous = mode
    let before = snapshot
    var request = URLRequest(url: LabConfig.sharedOrigin.appendingPathComponent("api/agent/status"))
    request.timeoutInterval = 1.5
    request.cachePolicy = .reloadIgnoringLocalCacheData
    let result = try? await URLSession.shared.data(for: request)
    if let (data, response) = result, (response as? HTTPURLResponse)?.statusCode == 200,
      let status = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    {
      agentEnabled = status["enabled"] as? Bool ?? false
      agentBusy = status["busy"] as? Bool ?? false
      agentModel = status["model"] as? String
    } else {
      agentEnabled = false
      agentBusy = false
      agentModel = nil
    }

    let share = result == nil ? nil : readShareState()
    restoreSharingIfNeeded(share)
    shareStatus = share?.status ?? "off"
    shareError = share?.lastError
    sharingIntent = shareStatus != "off"
    if sharingIntent, let share {
      publicURL = share.linkReady ? share.url.flatMap(URL.init(string:)) : nil
      recoveryGaveUp = share.status == "gave-up"
      switch share.status {
      case "ready": health = .ok
      case "gave-up": health = .down
      case "degraded", "restarting": health = .degraded
      default: health = .unknown
      }
    } else {
      publicURL = nil
      health = .unknown
      recoveryGaveUp = false
      lastPublicHost = nil
    }

    var changedTunnel: URL?
    if let url = publicURL, let host = url.host {
      if let old = lastPublicHost, old != host {
        oldTunnelHosts.insert(old)
        changedTunnel = url
      }
      lastPublicHost = host
    }
    if previous != mode || before != snapshot { onChange?() }
    if let changedTunnel { onTunnelChange?(changedTunnel, userInitiated) }
    return previous != mode
  }

  /// Brings the link back after the whole lab died and came back (it always starts with sharing off).
  /// Sharing switched off from outside (`lab share off` on the same lab process) is respected.
  private func restoreSharingIfNeeded(_ share: ShareState?) {
    guard wantsSharing, task == nil, !restoringShare else { return }
    guard let share else {
      ensureLocalServer()
      return
    }
    if share.status != "off" {
      sharingLabPid = share.pid
      return
    }
    guard share.pid != sharingLabPid else {
      wantsSharing = false
      return
    }
    restoringShare = true
    sharingLabPid = share.pid
    Task {
      _ = await lab(["share", "on"])
      restoringShare = false
    }
  }

  /// Public origin of the current link, also while it is being checked (for recognising our own tunnel URLs).
  func readPublicURL() -> URL? {
    guard let url = readShareState()?.url, let host = URL(string: url)?.host else { return nil }
    return URL(string: "https://\(host)/")
  }

  // MARK: Actions

  /// Starts the lab (`node scripts/lab.mjs start`: app + bridge + share supervisor, agent access off) when nothing answers.
  func ensureLocalServer() {
    guard localProcess?.isRunning != true else { return }
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
    let log = LabConfig.labLogHandle()
    process.standardOutput = log ?? FileHandle.nullDevice
    process.standardError = log ?? FileHandle.nullDevice
    do { try process.run(); localProcess = process } catch { localProcess = nil }
  }

  /// Waits until the lab's supervisor publishes its state (the lab is up), starting the lab if needed.
  private func waitForLab(timeout: TimeInterval) async -> Bool {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      if readShareState() != nil { return true }
      ensureLocalServer()
      try? await Task.sleep(for: .seconds(1))
    }
    return false
  }

  /// Runs `node scripts/lab.mjs <arguments>` and returns its exit status and output.
  private func lab(_ arguments: [String]) async -> (ok: Bool, output: String) {
    guard !LabConfig.projectDir.isEmpty, let node = LabConfig.nodePath else {
      return (false, "Node.js or the project directory was not found (set the ProjectDir default).")
    }
    let script = LabConfig.projectDir + "/scripts/lab.mjs"
    return await withCheckedContinuation { continuation in
      let process = Process()
      process.executableURL = URL(fileURLWithPath: node)
      process.arguments = [script] + arguments
      process.environment = LabConfig.childEnvironment(node: node)
      process.currentDirectoryURL = URL(fileURLWithPath: LabConfig.projectDir)
      process.standardInput = FileHandle.nullDevice
      let pipe = Pipe()
      process.standardOutput = pipe
      process.standardError = pipe
      process.terminationHandler = { finished in
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        continuation.resume(returning: (finished.terminationStatus == 0, String(decoding: data, as: UTF8.self)))
      }
      do { try process.run() } catch { continuation.resume(returning: (false, error.localizedDescription)) }
    }
  }

  private func run(_ label: String, _ body: () async -> (ok: Bool, output: String)) async -> (ok: Bool, output: String) {
    task = label
    userInitiated = true
    onChange?()
    let result = await body()
    await refresh()
    task = nil
    userInitiated = false
    onChange?()
    return result
  }

  /// Turns the link on and waits until it works (cloudflared connected, public URL answers, local DNS knows it).
  func startSharing() async -> (ok: Bool, output: String) {
    await run("Starting the link…") {
      guard await waitForLab(timeout: 180) else { return (false, "Whiteboard Studio did not start within 3 minutes.") }
      wantsSharing = true
      sharingLabPid = readShareState()?.pid
      return await lab(["share", "on", "--wait", "150"])
    }
  }

  func stopSharing() async -> (ok: Bool, output: String) {
    wantsSharing = false
    return await run("Stopping the link…") { await lab(["share", "off", "--wait", "20"]) }
  }

  /// Asks the supervisor for a new link; it still waits for the current backoff step.
  func restartLink() async -> (ok: Bool, output: String) {
    await run("Restarting the link…") { await lab(["share", "restart", "--wait", "300"]) }
  }

  func setAgent(enabled: Bool) async -> (ok: Bool, output: String) {
    await run(enabled ? "Enabling the agent…" : "Disabling the agent…") { await lab(["agent", enabled ? "on" : "off"]) }
  }
}
