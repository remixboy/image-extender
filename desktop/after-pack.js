// Runs automatically right after the app is packaged, before the installers are made.
// It copies the Next.js server (including its node_modules folder, which the
// packager would otherwise leave out) into the app's Resources/next-server folder.

const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  const resources =
    context.electronPlatformName === 'darwin'
      ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
      : path.join(context.appOutDir, 'resources');

  const root = path.join(__dirname, '..');
  const standalone = path.join(root, '.next', 'standalone');
  const dest = path.join(resources, 'next-server');

  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(standalone, dest, { recursive: true, verbatimSymlinks: true });
  fs.cpSync(path.join(root, '.next', 'static'), path.join(dest, '.next', 'static'), { recursive: true });
  if (fs.existsSync(path.join(root, 'public'))) {
    fs.cpSync(path.join(root, 'public'), path.join(dest, 'public'), { recursive: true });
  }

  for (const must of ['server.js', path.join('node_modules', 'next', 'package.json'), path.join('.next', 'static')]) {
    if (!fs.existsSync(path.join(dest, must))) {
      throw new Error(`after-pack: ${must} is missing from ${dest}`);
    }
  }
  console.log(`  • copied Next.js server into ${dest}`);
};
