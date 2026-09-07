import NanoIcons
import SwiftUI
import UIKit

// Both benchmark variants vend plain UIViews so the grid layout
// and timing code stay identical.
protocol IconGridRenderer {
    var title: String { get }
    func makeIconView(index: Int, pointSize: CGFloat) -> UIView
}

struct NanoGridRenderer: IconGridRenderer {
    let title = "NanoIconView"
    // roughly matching the SF Symbol picks below
    private let names = [
        "Bell", "ArrowLeft", "Calendar", "Bookmark", "Bolt",
        "Camera", "Chart", "Check", "Basket", "Alarm",
    ]

    func makeIconView(index: Int, pointSize: CGFloat) -> UIView {
        let view = NanoIconView(
            set: IconSets.outline,
            name: names[index % names.count],
            pointSize: pointSize)
        return view
    }
}

struct SFSymbolGridRenderer: IconGridRenderer {
    let title = "SF Symbols (UIImageView)"
    private let names = [
        "bell", "arrow.left", "calendar", "bookmark", "bolt",
        "camera", "chart.bar", "checkmark", "basket", "alarm",
    ]

    func makeIconView(index: Int, pointSize: CGFloat) -> UIView {
        let config = UIImage.SymbolConfiguration(pointSize: pointSize)
        let image = UIImage(systemName: names[index % names.count], withConfiguration: config)
        let view = UIImageView(image: image)
        view.tintColor = UIColor(red: 0, green: 26 / 255, blue: 114 / 255, alpha: 1)
        view.contentMode = .scaleAspectFit
        return view
    }
}

final class BenchmarkGridContainer: UIView {
    private var displayLink: CADisplayLink?
    private var startTime: CFTimeInterval = 0
    private var completion: ((Double) -> Void)?

    // Wall time from just before view creation until the first display-link
    // tick after everything was laid out and drawn — i.e. the frame that
    // actually shows the icons has been committed.
    func run(renderer: IconGridRenderer, count: Int, completion: @escaping (Double) -> Void) {
        displayLink?.invalidate()
        subviews.forEach { $0.removeFromSuperview() }
        self.completion = completion

        let iconSize: CGFloat = 24
        let spacing: CGFloat = 2
        let cell = iconSize + spacing
        let perRow = max(1, Int(bounds.width / cell))

        startTime = CACurrentMediaTime()
        for i in 0..<count {
            let view = renderer.makeIconView(index: i, pointSize: iconSize)
            view.frame = CGRect(
                x: CGFloat(i % perRow) * cell,
                y: CGFloat(i / perRow) * cell,
                width: iconSize, height: iconSize)
            addSubview(view)
        }

        let link = CADisplayLink(target: self, selector: #selector(tick))
        link.add(to: .main, forMode: .common)
        displayLink = link
    }

    @objc private func tick() {
        let elapsed = (CACurrentMediaTime() - startTime) * 1000
        displayLink?.invalidate()
        displayLink = nil
        completion?(elapsed)
        completion = nil
    }
}

struct BenchmarkGrid: UIViewRepresentable {
    @Binding var trigger: BenchmarkRequest?
    let onResult: (Double) -> Void

    func makeUIView(context: Context) -> BenchmarkGridContainer {
        BenchmarkGridContainer()
    }

    func updateUIView(_ view: BenchmarkGridContainer, context: Context) {
        guard let request = trigger else { return }
        DispatchQueue.main.async {
            trigger = nil
            view.run(renderer: request.renderer, count: request.count) { onResult($0) }
        }
    }
}

struct BenchmarkRequest {
    let renderer: IconGridRenderer
    let count: Int
}

struct BenchmarkView: View {
    @State private var trigger: BenchmarkRequest?
    @State private var pendingLabel = ""
    @State private var lastResult: String = "—"
    @State private var running = false

    private let counts = [500, 1000, 2000]
    private let renderers: [IconGridRenderer] = [NanoGridRenderer(), SFSymbolGridRenderer()]

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                ForEach(renderers.indices, id: \.self) { r in
                    HStack {
                        Text(renderers[r].title)
                            .font(.caption)
                            .frame(width: 130, alignment: .leading)
                        ForEach(counts, id: \.self) { n in
                            Button("\(n)") {
                                running = true
                                let renderer = renderers[r]
                                pendingLabel = "\(renderer.title) x\(n)"
                                trigger = BenchmarkRequest(renderer: renderer, count: n)
                            }
                            .buttonStyle(.bordered)
                            .disabled(running)
                        }
                    }
                }

                Text(lastResult)
                    .font(.system(.title3, design: .monospaced))
                    .padding(.top, 4)

                ScrollView {
                    BenchmarkGrid(trigger: $trigger) { ms in
                        lastResult = String(format: "%@: %.1f ms", pendingLabel, ms)
                        running = false
                    }
                    .frame(height: 2200)
                }
                .border(.quaternary)
            }
            .padding()
            .navigationTitle("Benchmark")
            .onAppear {
                if ProcessInfo.processInfo.environment["AUTORUN_BENCH"] != nil {
                    running = true
                    pendingLabel = "\(renderers[0].title) x1000"
                    trigger = BenchmarkRequest(renderer: renderers[0], count: 1000)
                }
            }
        }
    }
}
