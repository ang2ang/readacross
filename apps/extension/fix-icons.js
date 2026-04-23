/**
 * Post-build script: Replace Plasmo's auto-generated grayscale icons
 * with our pre-generated colored versions.
 * 
 * Plasmo converts assets/icon.png to grayscale when generating
 * icon16/32/48/64/128. This script overwrites them after each build.
 */
const fs = require("fs")
const path = require("path")

const sizes = [16, 32, 48, 64, 128]
const assetsDir = path.join(__dirname, "assets")

// Find the build directory (dev or prod)
const buildBase = path.join(__dirname, "build")
if (!fs.existsSync(buildBase)) process.exit(0)

const buildDirs = fs.readdirSync(buildBase).filter(d => d.startsWith("chrome-mv3"))

for (const dir of buildDirs) {
    const buildDir = path.join(buildBase, dir)
    if (!fs.statSync(buildDir).isDirectory()) continue;
    const files = fs.readdirSync(buildDir)

    for (const size of sizes) {
        const src = path.join(assetsDir, `icon${size}.png`)
        if (!fs.existsSync(src)) continue

        // Find the Plasmo-generated icon file (e.g. icon16.plasmo.xxx.png)
        const target = files.find(f => f.startsWith(`icon${size}.plasmo.`) && f.endsWith(".png"))
        if (target) {
            fs.copyFileSync(src, path.join(buildDir, target))
            console.log(`✅ Replaced ${target} with colored icon${size}.png`)
        }
    }
}
