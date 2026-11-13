import AppKit

extension AppDelegate {
  var publicLinkForCurrentBoard: URL? {
    guard let origin = server.publicURL else { return nil }
    let path = selectedBoard.map { LabConfig.isLocal($0.url) ? $0.url.path : "/" } ?? "/"
    return URL(string: path, relativeTo: origin)?.absoluteURL
  }

  /// Same menu for a left click in shared mode and for a right click in any mode.
  func cloudMenu() -> NSMenu? {
    let menu = NSMenu()
    guard server.mode == .shared else {
      menu.addItem(ClosureMenuItem("Share via Cloudflare…") { [weak self] in self?.confirmSharing() })
      return menu
    }
    if let link = publicLinkForCurrentBoard {
      let header = NSMenuItem(title: link.host ?? "", action: nil, keyEquivalent: "")
      header.isEnabled = false
      menu.addItem(header)
      menu.addItem(ClosureMenuItem("Copy link address") { Self.copy(link.absoluteString) })
      menu.addItem(ClosureMenuItem("Open link in browser") { NSWorkspace.shared.open(link) })
    } else {
      // No link is handed out until it works; "Copy" waits for it instead of copying a dead address.
      let header = NSMenuItem(title: Self.shareStatusText(server), action: nil, keyEquivalent: "")
      header.isEnabled = false
      menu.addItem(header)
      menu.addItem(ClosureMenuItem("Copy link when it works") { [weak self] in self?.copyWhenReady() })
    }
    if server.recoveryGaveUp || server.health == .degraded {
      menu.addItem(ClosureMenuItem("Restart link") { [weak self] in self?.restartLink() })
    }
    menu.addItem(.separator())
    menu.addItem(ClosureMenuItem("Stop sharing via Cloudflare") { [weak self] in self?.stopSharing() })
    return menu
  }

  static func shareStatusText(_ server: LabServer) -> String {
    switch server.shareStatus {
    case "gave-up": return "Link is down; automatic restarts paused"
    case "restarting": return "Link is down; restarting soon…"
    case "degraded": return "Link is not responding…"
    default: return "Checking the link…"
    }
  }

  /// Clicking never resets the supervisor's backoff; the menu only reads its state.
  func cloudPressed(_ anchor: NSView) {
    if server.mode == .shared {
      cloudMenu()?.popUp(positioning: nil, at: NSPoint(x: 0, y: anchor.bounds.height + 4), in: anchor)
    } else {
      confirmSharing()
    }
  }

  private func confirmSharing() {
    let alert = NSAlert()
    alert.messageText = "Share via Cloudflare?"
    alert.informativeText = """
      A public Cloudflare link to this lab will be created, and anyone with the link to this board will be able to edit it. \
      The agent will stay off until you turn it on. The link will be copied to the clipboard once it works.
      """
    alert.addButton(withTitle: "Share")
    alert.addButton(withTitle: "Cancel")
    alert.beginSheetModal(for: window) { [weak self] response in
      guard response == .alertFirstButtonReturn, let self else { return }
      Task { await self.startSharing() }
    }
  }

  private func startSharing() async {
    let result = await server.startSharing()
    retargetLocalTabs()
    guard result.ok, let link = publicLinkForCurrentBoard else {
      showError("Could not enable sharing via Cloudflare", result.output)
      return
    }
    Self.copy(link.absoluteString)
    let alert = NSAlert()
    alert.messageText = "Sharing is on, link copied"
    alert.informativeText = link.absoluteString
    alert.beginSheetModal(for: window) { _ in }
  }

  /// Waits (in the background) for the supervisor to report a working link, then copies it.
  private func copyWhenReady() {
    Task {
      for _ in 0..<150 {
        if let link = publicLinkForCurrentBoard {
          Self.copy(link.absoluteString)
          let alert = NSAlert()
          alert.messageText = "Link copied"
          alert.informativeText = link.absoluteString
          alert.beginSheetModal(for: window) { _ in }
          return
        }
        guard server.mode == .shared else { return }
        try? await Task.sleep(for: .seconds(2))
        await server.refresh()
      }
    }
  }

  private func restartLink() {
    Task {
      let result = await server.restartLink()
      if !result.ok { showError("The link is not working yet", result.output) }
    }
  }

  private func stopSharing() {
    Task {
      let result = await server.stopSharing()
      retargetLocalTabs()
      if !result.ok { showError("Could not stop Cloudflare", result.output) }
    }
  }

  func agentPressed() {
    guard server.mode == .shared else { return }
    if server.agentEnabled {
      Task { await setAgent(false) }
      return
    }
    let alert = NSAlert()
    alert.messageText = "Enable the agent in the board chat?"
    alert.informativeText = """
      People with the public link will be able to send requests to the configured agent \
      (\(server.agentModel ?? "the configured model")), which modify the board. You can turn it off with the same button.
      """
    alert.addButton(withTitle: "Enable")
    alert.addButton(withTitle: "Cancel")
    alert.beginSheetModal(for: window) { [weak self] response in
      guard response == .alertFirstButtonReturn, let self else { return }
      Task { await self.setAgent(true) }
    }
  }

  private func setAgent(_ enabled: Bool) async {
    let result = await server.setAgent(enabled: enabled)
    if !result.ok { showError(enabled ? "Could not enable the agent" : "Could not disable the agent", result.output) }
  }

  private func showError(_ title: String, _ output: String) {
    let alert = NSAlert()
    alert.alertStyle = .warning
    alert.messageText = title
    alert.informativeText = String(output.suffix(1200))
    alert.beginSheetModal(for: window) { _ in }
  }

  static func copy(_ text: String) {
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(text, forType: .string)
  }
}
