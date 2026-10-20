import AppKit

extension AppDelegate {
  // MARK: Menu actions

  @objc func newTab(_ sender: Any?) { openHome() }
  @objc func closeTab(_ sender: Any?) { if let board = selectedBoard { close(board) } }
  @objc func nextTab(_ sender: Any?) { selectRelative(1) }
  @objc func previousTab(_ sender: Any?) { selectRelative(-1) }
  @objc func reloadTab(_ sender: Any?) { selectedBoard?.reload() }
  @objc func openInBrowser(_ sender: Any?) { if let url = selectedBoard?.url { NSWorkspace.shared.open(url) } }
  @objc func copyLink(_ sender: Any?) { selectedBoard.map { Self.copy($0.url.absoluteString) } }
  @objc func unloadBackgroundTabs(_ sender: Any?) { sweep(force: true) }
  @objc func goBack(_ sender: Any?) { selectedBoard?.webView?.goBack() }
  @objc func goForward(_ sender: Any?) { selectedBoard?.webView?.goForward() }
  @objc func showMainWindow(_ sender: Any?) { showWindow() }

  // MARK: Menu

  func buildMainMenu() {
    let main = NSMenu()

    let appMenu = NSMenu()
    appMenu.addItem(withTitle: "About Whiteboard Studio", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
    appMenu.addItem(.separator())
    appMenu.addItem(withTitle: "Hide Whiteboard Studio", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
    let hideOthers = appMenu.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
    hideOthers.keyEquivalentModifierMask = [.command, .option]
    appMenu.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
    appMenu.addItem(.separator())
    appMenu.addItem(item("Quit Whiteboard Studio", #selector(quit(_:)), "q"))
    addSubmenu(appMenu, title: "Whiteboard Studio", to: main)

    let fileMenu = NSMenu(title: "File")
    fileMenu.addItem(item("New Tab", #selector(newTab(_:)), "t"))
    fileMenu.addItem(item("Close tab", #selector(closeTab(_:)), "w"))
    fileMenu.addItem(.separator())
    fileMenu.addItem(item("Open in browser", #selector(openInBrowser(_:)), ""))
    fileMenu.addItem(item("Copy link", #selector(copyLink(_:)), ""))
    addSubmenu(fileMenu, title: "File", to: main)

    let editMenu = NSMenu(title: "Edit")
    editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
    let redo = editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "z")
    redo.keyEquivalentModifierMask = [.command, .shift]
    editMenu.addItem(.separator())
    editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
    editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
    editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
    addSubmenu(editMenu, title: "Edit", to: main)

    let viewMenu = NSMenu(title: "View")
    viewMenu.addItem(item("Reload", #selector(reloadTab(_:)), "r"))
    viewMenu.addItem(item("Back", #selector(goBack(_:)), ""))
    viewMenu.addItem(item("Forward", #selector(goForward(_:)), ""))
    viewMenu.addItem(.separator())
    viewMenu.addItem(item("Unload Background Tabs", #selector(unloadBackgroundTabs(_:)), ""))
    viewMenu.addItem(.separator())
    let fullScreen = viewMenu.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
    fullScreen.keyEquivalentModifierMask = [.command, .control]
    addSubmenu(viewMenu, title: "View", to: main)

    let windowMenu = NSMenu(title: "Window")
    windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
    windowMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
    windowMenu.addItem(.separator())
    let next = item("Next Tab", #selector(nextTab(_:)), "\t")
    next.keyEquivalentModifierMask = [.control]
    windowMenu.addItem(next)
    let previous = item("Previous Tab", #selector(previousTab(_:)), "\t")
    previous.keyEquivalentModifierMask = [.control, .shift]
    windowMenu.addItem(previous)
    windowMenu.addItem(.separator())
    windowMenu.addItem(item("Whiteboard Studio", #selector(showMainWindow(_:)), "0"))
    addSubmenu(windowMenu, title: "Window", to: main)

    NSApp.mainMenu = main
  }

  private func item(_ title: String, _ action: Selector, _ key: String) -> NSMenuItem {
    let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
    item.target = self
    return item
  }

  private func addSubmenu(_ menu: NSMenu, title: String, to main: NSMenu) {
    let holder = NSMenuItem(title: title, action: nil, keyEquivalent: "")
    holder.submenu = menu
    main.addItem(holder)
  }
}


/// Menu item that runs a closure; keeps context menus compact.
@MainActor
final class ClosureMenuItem: NSMenuItem {
  private let handler: () -> Void

  init(_ title: String, _ handler: @escaping () -> Void) {
    self.handler = handler
    super.init(title: title, action: #selector(run), keyEquivalent: "")
    target = self
  }

  @available(*, unavailable)
  required init(coder: NSCoder) { fatalError() }

  @objc private func run() { handler() }
}
