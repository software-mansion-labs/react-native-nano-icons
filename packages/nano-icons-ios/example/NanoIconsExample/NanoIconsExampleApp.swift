import NanoIcons
import SwiftUI

enum IconSets {
    static let outline = try! NanoIconSet(named: "SWMIconsOutline")
    static let twotone = try! NanoIconSet(named: "MaterialIconsTwotone")
}

@main
struct NanoIconsExampleApp: App {
    var body: some Scene {
        WindowGroup {
            TabView {
                GalleryView()
                    .tabItem { Label("Gallery", systemImage: "square.grid.3x3") }
                BenchmarkView()
                    .tabItem { Label("Benchmark", systemImage: "stopwatch") }
            }
        }
    }
}
