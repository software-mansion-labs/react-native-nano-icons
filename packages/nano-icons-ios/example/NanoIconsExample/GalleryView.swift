import NanoIcons
import SwiftUI

struct GalleryView: View {
    private let outlineSample = [
        "Air", "Alarm", "ArrowCircleDown", "ArrowLeft", "ArrowRight",
        "Bell", "Bookmark", "Calendar", "Camera", "Chart",
        "Check", "Clock", "Cloud", "Copy", "Download",
    ].filter { IconSets.outline.icon(named: $0) != nil }

    private let twotoneSample = [
        "10k", "13mp", "123", "10mp", "11mp", "12mp",
    ].filter { IconSets.twotone.icon(named: $0) != nil }

    private let columns = [GridItem(.adaptive(minimum: 64))]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    section("SWMIconsOutline — default colors") {
                        ForEach(outlineSample, id: \.self) { name in
                            cell(name) {
                                NanoIcon(set: IconSets.outline, name: name, size: 32)
                            }
                        }
                    }
                    section("SWMIconsOutline — recolored") {
                        ForEach(outlineSample.prefix(10), id: \.self) { name in
                            cell(name) {
                                NanoIcon(
                                    set: IconSets.outline, name: name, size: 32,
                                    color: .systemRed)
                            }
                        }
                    }
                    section("MaterialIconsTwotone — multicolor layers") {
                        ForEach(twotoneSample, id: \.self) { name in
                            cell(name) {
                                NanoIcon(set: IconSets.twotone, name: name, size: 32)
                            }
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("Gallery")
        }
    }

    @ViewBuilder
    private func section<Content: View>(
        _ title: String, @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.headline)
            LazyVGrid(columns: columns, spacing: 12) {
                content()
            }
        }
    }

    private func cell<Icon: View>(_ name: String, @ViewBuilder icon: () -> Icon) -> some View {
        VStack(spacing: 4) {
            icon().frame(width: 32, height: 32)
            Text(name)
                .font(.system(size: 9))
                .lineLimit(1)
                .foregroundStyle(.secondary)
        }
    }
}
