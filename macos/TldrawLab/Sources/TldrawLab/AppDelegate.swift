import AppKit
import WebKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
  let server = LabServer()
  private(set) var window: NSWindow!
  let tabBar = TabBarView(frame: NSRect(x: 0, y: 0, width: 1200, height: 36))
  private let content = NSView()
  var boards: [Board] = []
  private(set) var selectedBoard: Board?
  private var pendingURLs: [URL] = []
  private(set) var didLaunch = false
  private(set) var isTerminating = false
  var isCheckingServer = false
  var isCheckingHealth = false
  var healthPending = false
  var healthGeneration = 0
  private var wakeObserver: NSObjectProtocol?
  private var timers: [Timer] = []
  private var memoryPressure: DispatchSourceMemoryPressure?

  static let sessionKey = "SessionTabs"
  static let selectedKey = "SessionSelected"

  lazy var webConfiguration: WKWebViewConfiguration = {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .default()
    configuration.applicationNameForUserAgent = "Version/26.0 Safari/605.1.15 TldrawLab/0.2"
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
    configuration.preferences.isElementFullscreenEnabled = true
    configuration.mediaTypesRequiringUserActionForPlayback = []
    return configuration
  }()

  // MARK: NSApplicationDelegate

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSWindow.allowsAutomaticWindowTabbing = false
    buildMainMenu()
    buildWindow()
    // Activity Monitor and logout send a quit Apple Event; route it through quit(_:) too.
    NSAppleEventManager.shared().setEventHandler(
      self, andSelector: #selector(handleQuitEvent(_:withReply:)),
      forEventClass: AEEventClass(kCoreEventClass), andEventID: AEEventID(kAEQuitApplication))
    server.onChange = { [weak self] in self?.serverChanged() }
    server.onTunnelChange = { [weak self] url, userInitiated in self?.tunnelChanged(to: url, userInitiated: userInitiated) }

    Task {
      await server.refresh()
      let saved = restoreSession()
      didLaunch = true
      let pending = pendingURLs
      pendingURLs = []
      pending.forEach { open($0) }
      if boards.isEmpty {
        openHome()
      } else if pending.isEmpty {
        select(saved ?? boards[0])
      }
      window.makeKeyAndOrderFront(nil)
      NSApp.activate()
    }

    timers = [
      Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
        MainActor.assumeIsolated { self?.sweep() }
      },
      Timer.scheduledTimer(withTimeInterval: 4, repeats: true) { [weak self] _ in
        MainActor.assumeIsolated { self?.pollServer() }
      },
    ]
    scheduleHealthCheck(after: 10)
    wakeObserver = NSWorkspace.shared.notificationCenter.addObserver(
      forName: NSWorkspace.didWakeNotification, object: nil, queue: .main
    ) { [weak self] _ in
      MainActor.assumeIsolated { self?.systemDidWake() }
    }
    let source = DispatchSource.makeMemoryPressureSource(eventMask: [.warning, .critical], queue: .main)
    source.setEventHandler { [weak self] in
      MainActor.assumeIsolated { self?.sweep(force: true) }
    }
    source.resume()
    memoryPressure = source
  }

  func application(_ application: NSApplication, open urls: [URL]) {
    for url in urls {
      if url.scheme?.lowercased() == Self.appScheme {
        Self.labURL(fromAppURL: url).map { open($0) }
      } else {
        open(url)
      }
    }
  }

  private static let appScheme = "tldrawlab"

  /// `tldrawlab://localhost:<port>/d/:id?q` → `http://localhost:<port>/d/:id?q`; only local hosts are accepted.
  private static func labURL(fromAppURL url: URL) -> URL? {
    guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
    components.scheme = "http"
    guard let target = components.url, LabConfig.isLocal(target) else { return nil }
    return target
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    if !flag { showWindow() }
    return true
  }

  /// AppKit refuses to quit (it just beeps) while a sheet is attached, so dismiss sheets first.
  @objc func quit(_ sender: Any?) {
    while let window, let sheet = window.attachedSheet { window.endSheet(sheet) }
    NSApp.terminate(sender)
  }

  @objc private func handleQuitEvent(_ event: NSAppleEventDescriptor, withReply reply: NSAppleEventDescriptor) {
    quit(nil)
  }

  func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    saveSession()
    isTerminating = true
    return .terminateNow
  }

  // MARK: Window

  private func buildWindow() {
    window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900),
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered,
      defer: false
    )
    window.isReleasedWhenClosed = false
    window.tabbingMode = .disallowed
    window.collectionBehavior = [.fullScreenPrimary]
    window.minSize = NSSize(width: 640, height: 420)
    window.title = "Tldraw Lab"
    window.delegate = self
    content.autoresizingMask = [.width, .height]
    window.contentView = content

    let accessory = NSTitlebarAccessoryViewController()
    tabBar.autoresizingMask = [.width]
    accessory.view = tabBar
    accessory.layoutAttribute = .bottom
    window.addTitlebarAccessoryViewController(accessory)

    tabBar.onSelect = { [weak self] id in self?.board(id).map { self?.select($0) } }
    tabBar.onClose = { [weak self] id in self?.board(id).map { self?.close($0) } }
    tabBar.onMenu = { [weak self] id, event, view in self?.showTabMenu(id, event, view) }
    tabBar.onNewTab = { [weak self] in self?.openHome() }
    tabBar.onCloud = { [weak self] anchor in self?.cloudPressed(anchor) }
    tabBar.cloudMenu = { [weak self] in self?.cloudMenu() }
    tabBar.onAgent = { [weak self] in self?.agentPressed() }
    serverChanged()

    window.setFrameAutosaveName("TldrawLabMain")
    if !window.setFrameUsingName("TldrawLabMain") { window.center() }
  }

  func showWindow() {
    if boards.isEmpty { openHome() }
    selectedBoard?.wake()
    window.makeKeyAndOrderFront(nil)
    NSApp.activate()
  }

  /// The red button hides the window and frees every tab's memory; tabs stay in the strip.
  func windowShouldClose(_ sender: NSWindow) -> Bool {
    window.orderOut(nil)
    boards.forEach { $0.hibernate() }
    return false
  }

  // MARK: Tabs

  private func board(_ id: UUID) -> Board? { boards.first { $0.id == id } }

  func openHome() { open(server.homeURL, reuse: false) }

  /// Opens a lab URL in its existing tab, or in a new tab next to the current one.
  func open(_ url: URL, reuse: Bool = true) {
    guard didLaunch else {
      pendingURLs.append(url)
      return
    }
    guard LabConfig.isLabURL(url) else {
      NSWorkspace.shared.open(url)
      return
    }
    let target = normalize(url)
    if reuse, let existing = boards.first(where: { $0.key == LabConfig.key(for: target) }) {
      existing.navigate(to: target)
      select(existing)
    } else {
      let board = Board(url: target, title: nil, app: self)
      let index = selectedBoard.flatMap { current in boards.firstIndex { $0 === current } }.map { $0 + 1 } ?? boards.count
      boards.insert(board, at: index)
      select(board)
    }
    window.makeKeyAndOrderFront(nil)
    NSApp.activate()
  }

  /// Local lab URLs follow the current server mode; our own tunnel URL is served through the local bridge.
  func normalize(_ url: URL) -> URL {
    if LabConfig.isTunnel(url), let host = url.host,
      host == server.readPublicURL()?.host || server.oldTunnelHosts.contains(host)
    {
      return LabConfig.rebase(url, onto: LabConfig.sharedOrigin)
    }
    if LabConfig.isLocal(url), let port = url.port, LabConfig.labPorts.contains(port) {
      return LabConfig.rebase(url, onto: server.localOrigin)
    }
    return url
  }

  func select(_ board: Board) {
    if selectedBoard !== board {
      selectedBoard?.touch()
      selectedBoard?.view.removeFromSuperview()
      selectedBoard = board
      board.view.frame = content.bounds
      content.addSubview(board.view)
    }
    board.touch()
    board.wake()
    window.title = board.pageTitle
    if let webView = board.webView { window.makeFirstResponder(webView) }
    enforceLiveLimit()
    refreshTabs()
    sessionChanged()
  }

  func close(_ board: Board) {
    guard let index = boards.firstIndex(where: { $0 === board }) else { return }
    board.hibernate()
    board.view.removeFromSuperview()
    boards.remove(at: index)
    if selectedBoard === board {
      selectedBoard = nil
      if boards.isEmpty {
        window.orderOut(nil)
        window.title = "Tldraw Lab"
      } else {
        select(boards[min(index, boards.count - 1)])
      }
    }
    refreshTabs()
    sessionChanged()
  }

  func boardChanged(_ board: Board) {
    if board === selectedBoard { window.title = board.pageTitle }
    refreshTabs()
    sessionChanged()
  }

  private func refreshTabs() {
    tabBar.update(tabs: boards.map {
      TabBarView.Tab(id: $0.id, title: $0.pageTitle, selected: $0 === selectedBoard, live: $0.isLive)
    })
  }

  func selectRelative(_ offset: Int) {
    guard let current = selectedBoard, let index = boards.firstIndex(where: { $0 === current }), boards.count > 1 else { return }
    select(boards[(index + offset + boards.count) % boards.count])
  }

  private func showTabMenu(_ id: UUID, _ event: NSEvent, _ view: NSView) {
    guard let board = board(id) else { return }
    let menu = NSMenu()
    menu.addItem(ClosureMenuItem("Close tab") { [weak self] in self?.close(board) })
    menu.addItem(ClosureMenuItem("Close other tabs") { [weak self] in
      self?.boards.filter { $0 !== board }.forEach { self?.close($0) }
    })
    menu.addItem(.separator())
    let unload = ClosureMenuItem("Unload from memory") { board.hibernate() }
    unload.isEnabled = board.isLive && board !== selectedBoard
    menu.addItem(unload)
    menu.addItem(ClosureMenuItem("Reload") { board.reload() })
    menu.addItem(.separator())
    menu.addItem(ClosureMenuItem("Copy link") { Self.copy(board.url.absoluteString) })
    menu.addItem(ClosureMenuItem("Open in browser") { NSWorkspace.shared.open(board.url) })
    NSMenu.popUpContextMenu(menu, with: event, for: view)
  }

  // MARK: Memory

  /// Unloads tabs that are in the background and idle; `force` unloads every background tab.
  func sweep(force: Bool = false) {
    let now = Date()
    let visible = window.isVisible && !window.isMiniaturized
    for board in boards {
      if board === selectedBoard, visible {
        board.touch()
      } else if board.isLive, force || now.timeIntervalSince(board.lastActive) > LabConfig.hibernateAfter {
        board.hibernate()
      }
    }
    enforceLiveLimit()
  }

  private func enforceLiveLimit() {
    let live = boards.filter(\.isLive)
    let excess = live.count - LabConfig.maxLiveTabs
    guard excess > 0 else { return }
    live.filter { $0 !== selectedBoard }
      .sorted { $0.lastActive < $1.lastActive }
      .prefix(excess)
      .forEach { $0.hibernate() }
  }
}
