import Foundation

/// Runtime settings. Override with `defaults write com.example.whiteboard-studio.app <Key> <value>`.
enum LabConfig {
  private static var defaults: UserDefaults { .standard }

  /// `share` section of `<data dir>/config.json` (the same file `npm run lab` reads), with the lab's defaults.
  private static var shareSettings: [String: Any] {
    let file = URL(fileURLWithPath: dataDir).appendingPathComponent("config.json")
    guard let data = try? Data(contentsOf: file),
      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return [:] }
    return json["share"] as? [String: Any] ?? [:]
  }

  /// The one effective data directory: the shell reads its config and hands the same path to the child (`WHITEBOARD_STUDIO_DATA_DIR`).
  static var dataDir: String {
    let root = defaults.string(forKey: "DataDir") ?? ProcessInfo.processInfo.environment["WHITEBOARD_STUDIO_DATA_DIR"] ?? "~/WhiteboardStudio-data"
    return (root as NSString).expandingTildeInPath
  }

  /// The one effective PATH: the inherited one plus the usual install dirs. `nodePath` and the child both use it.
  static var searchPath: [String] {
    let inherited = (ProcessInfo.processInfo.environment["PATH"] ?? "").split(separator: ":").map(String.init)
    return inherited + ["/opt/homebrew/bin", "/usr/local/bin", "\(NSHomeDirectory())/.volta/bin", "/usr/bin"]
  }

  /// `node` from `searchPath`; no login shell is involved.
  static var nodePath: String? { searchPath.map { $0 + "/node" }.first { FileManager.default.isExecutableFile(atPath: $0) } }

  /// Environment of the lab child: the effective data dir, and a PATH that starts with node's own directory so `env node` works from a GUI launch.
  static func childEnvironment(node: String) -> [String: String] {
    var env = ProcessInfo.processInfo.environment
    env["WHITEBOARD_STUDIO_DATA_DIR"] = dataDir
    let nodeDir = (node as NSString).deletingLastPathComponent
    var path: [String] = []
    for dir in [nodeDir] + searchPath where !path.contains(dir) { path.append(dir) }
    env["PATH"] = path.joined(separator: ":")
    return env
  }

  private static func port(_ key: String, default fallback: Int) -> Int {
    (shareSettings[key] as? Int).flatMap { (1...65535).contains($0) ? $0 : nil } ?? fallback
  }

  static var appPort: Int { port("port", default: 4173) }
  static var bridgePort: Int { port("bridgePort", default: 4174) }
  static var cloudflareEnabled: Bool { shareSettings["mode"] as? String == "cloudflare" }

  /// Public URL of a named tunnel (`share.cloudflarePublicUrl`); a Quick Tunnel URL is only printed by `npm run lab -- start`.
  static var configuredPublicURL: URL? {
    (shareSettings["cloudflarePublicUrl"] as? String).flatMap(URL.init(string:))
  }

  /// Ports of the lab servers; other local ports (tests) are left alone.
  static var labPorts: Set<Int> { [appPort, bridgePort] }

  /// Dev server of the lab (`share.port`).
  static var homeURL: URL {
    defaults.string(forKey: "HomeURL").flatMap(URL.init(string:)) ?? URL(string: "http://localhost:\(appPort)/")!
  }

  /// Agent bridge (`share.bridgePort`); proxies the app and is the entry point of a shared session.
  static var sharedOrigin: URL { URL(string: "http://127.0.0.1:\(bridgePort)/")! }

  /// `share.mode` (local, lan or cloudflare); the app only starts the lab by itself in `local`.
  static var shareMode: String { shareSettings["mode"] as? String ?? "local" }

  /// Checkout that holds `scripts/lab.mjs`: `WHITEBOARD_STUDIO_ROOT`, the `ProjectDir` default, or the path baked into Info.plist.
  static var projectDir: String {
    let plist = Bundle.main.object(forInfoDictionaryKey: "WhiteboardStudioProjectDir") as? String ?? ""
    let candidates = [
      ProcessInfo.processInfo.environment["WHITEBOARD_STUDIO_ROOT"], defaults.string(forKey: "ProjectDir"), plist,
    ]
    return candidates.compactMap { $0 }.first { !$0.isEmpty && !$0.hasPrefix("__") }
      .map { ($0 as NSString).expandingTildeInPath } ?? ""
  }

  /// Background tabs are unloaded after this idle time.
  static var hibernateAfter: TimeInterval {
    let minutes = defaults.double(forKey: "HibernateAfterMinutes")
    return (minutes > 0 ? minutes : 15) * 60
  }

  /// Hard cap on tabs keeping a live WebContent process.
  static var maxLiveTabs: Int {
    let count = defaults.integer(forKey: "MaxLiveTabs")
    return count > 0 ? count : 4
  }

  static func isLocal(_ url: URL) -> Bool {
    let host = url.host?.lowercased() ?? ""
    return host == "localhost" || host == "127.0.0.1"
  }

  static func isTunnel(_ url: URL) -> Bool {
    url.host?.lowercased().hasSuffix(".trycloudflare.com") ?? false
  }

  /// URLs that belong to the lab and stay inside the app; everything else goes to the default browser.
  static func isLabURL(_ url: URL) -> Bool {
    guard ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { return false }
    return isLocal(url) || isTunnel(url)
  }

  /// One tab per board. The lab's local ports are the same boards, so only the path counts.
  static func key(for url: URL) -> String {
    let path = url.path.isEmpty ? "/" : url.path
    return isLocal(url) ? "local\(path)" : "\(url.host?.lowercased() ?? "")\(path)"
  }

  /// Same path and query on another origin.
  static func rebase(_ url: URL, onto origin: URL) -> URL {
    var components = URLComponents(url: url, resolvingAgainstBaseURL: false) ?? URLComponents()
    components.scheme = origin.scheme
    components.host = origin.host
    components.port = origin.port
    return components.url ?? url
  }
}
