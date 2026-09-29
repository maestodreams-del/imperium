module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'IMPERIUM',
    icon: './icon'
  },
  makers: [{ name: '@electron-forge/maker-squirrel', config: {
    name: 'IMPERIUM',
    setupExe: 'IMPERIUM-Setup.exe',
    setupIcon: './icon.ico'
  }}]
};
