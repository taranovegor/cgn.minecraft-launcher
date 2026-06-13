# cgn.minecraft-launcher

Minecraft launcher for [craftgame.net](http://craftgame.net/).

Based on [Helios Launcher](https://github.com/dscalzi/HeliosLauncher) by [dscalzi](https://github.com/dscalzi).

---

## Features

- Full account management via craftgame.net authentication.
- Automatic installation of Java, Forge, and mods — no manual setup required.
- File validation before launch — corrupted or modified files are redownloaded automatically.
- Automatic launcher updates.

---

## Development

**Requirements:** Node.js v22

```bash
git clone https://github.com/taranovegor/cgn.minecraft-launcher.git
cd cgn.minecraft-launcher
npm install
npm start
```

**Build:**

```bash
npm run dist        # current platform
npm run dist:win    # Windows x64
npm run dist:linux  # Linux x64
npm run dist:mac    # macOS
```

---

## License

Source code is open source. Built on top of [Helios Launcher](https://github.com/dscalzi/HeliosLauncher) (MIT).
