import AppKit

extension AppDelegate {
  // MARK: Session

  func sessionChanged() {
    guard didLaunch, !isTerminating else { return }
    saveSession()
  }

  func saveSession() {
    let tabs = boards.map { ["url": $0.url.absoluteString, "title": $0.pageTitle] }
    UserDefaults.standard.set(tabs, forKey: Self.sessionKey)
    UserDefaults.standard.set(selectedBoard?.url.absoluteString, forKey: Self.selectedKey)
  }

  /// Recreates previous tabs hibernated; only the selected one loads.
  func restoreSession() -> Board? {
    let tabs = UserDefaults.standard.array(forKey: Self.sessionKey) as? [[String: String]] ?? []
    let selected = UserDefaults.standard.string(forKey: Self.selectedKey)
    var selectedBoard: Board?
    for tab in tabs {
      guard let raw = tab["url"], let url = URL(string: raw), LabConfig.isLabURL(url) else { continue }
      let target = normalize(url)
      guard !boards.contains(where: { $0.key == LabConfig.key(for: target) }) else { continue }
      let board = Board(url: target, title: tab["title"], app: self)
      boards.append(board)
      if raw == selected { selectedBoard = board }
    }
    return selectedBoard
  }
}
