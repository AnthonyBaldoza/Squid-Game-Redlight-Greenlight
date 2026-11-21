# 🔴 Red Light, Green Light

A 3D browser-based survival game inspired by the Red Light, Green Light challenge. Race against time, watch the doll carefully, and reach the finish line before the countdown ends!

Built using **HTML, CSS, Vanilla JavaScript (ES Modules), and Three.js**.

---

## 🎮 Gameplay

Experience the classic Red Light, Green Light challenge in a 3D environment.

- 🟢 **Green Light:** Run toward the finish line while the doll faces away and sings _“Mu-gung-hwa kkot-i pi-eot-seum-ni-da”_. The song speeds up and slows down each round. When it ends, she turns around, so freeze on the last note!
- 🔴 **Red Light:** Stop immediately when the doll turns around and her eyes glow.
- ⏱️ **Time Limit:** Reach the finish line within 70 seconds.
- ⚠️ **Elimination:** Your character does NOT stop by itself. Let go of the controls when the doll turns. Moving (or jumping) after the 0.5-second reaction window results in elimination. If you let go in time, the little slide your character still does while slowing down is forgiven for a further 0.25 s (so you really do have the full 0.5 s). Being shoved by others never counts.
- 🤖 **AI Contestants:** Compete alongside approximately 24 AI contestants. You bump into them, and if one is eliminated right next to you, the falling body can shove or trip you (jump to dodge it).
- 💥 **Dramatic Elimination:** A gunshot with muzzle sparks and tracer fire, a white-to-red flash and slow motion while the camera punches in on your face as you jerk back from the hit. Red splatter and a shockwave burst out, then hard cuts to the doll staring at you and to your body dropping face-first onto a spreading red stain under a closing dark-red vignette, with a low sinking drone, before the game over screen. Eliminated contestants get a smaller splatter and leave a stain too.
- 🌇 **Time of Day:** Choose DAY, AFTERNOON or SUNSET in Settings (different sky, fog, lighting, and a visible sun at sunset).
- 🎬 **Cinematic Intro:** The first start from the main menu plays a camera flight with a title card (tap or press any key to skip). Retrying skips straight to the countdown.
- 🏆 **Best Time:** Your best completion time is saved using browser `localStorage`.
- 📤 **Share:** After winning or getting eliminated, tap SHARE to post a result card to Facebook (system share sheet on phones; on desktop the image is saved/copied and Facebook's share dialog opens).

Your camera movement does not count as player movement.

---

## 🕹️ Controls

| Platform | Movement          | Sprint      | Look                      |
| :------- | :---------------- | :---------- | :------------------------ |
| Desktop  | WASD / Arrow Keys | Shift       | Mouse                     |
| Mobile   | Left Joystick     | Hold SPRINT | Drag right side of screen |

**Desktop:** Click the game screen to capture mouse movement.

**Mobile:** Use the on-screen joystick and drag the right side of the screen to control the camera.

---

## ⚙️ Graphics Settings

The game includes three graphics presets:

- **LOW** – Best for low-end devices.
- **MEDIUM** – Balanced graphics and performance.
- **HIGH** – Better visual quality.

The game automatically selects a recommended preset based on your device. Render resolution also adapts when the frame rate drops.

---

## 🚀 Run Locally

This project uses JavaScript ES modules, so it must run through a local HTTP server instead of opening `index.html` directly.

**1. Open the project folder in your terminal.**

**2. Start a local Python server:**

```bash
cd Squid-Game-Redlight-Greenlight
python -m http.server 8000
```

**3. Open the game in your browser:**

http://localhost:8000

---

## 🌐 Deployment (GitHub Pages)

Follow these steps to deploy your game for free using GitHub Pages.

**1. Initialize Git in your project folder:**

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
```

**2. Connect your GitHub repository:**

```bash
git remote add origin https://github.com/AnthonyBaldoza/Squid-Game-Redlight-Greenlight.git
git push -u origin main
```

**3. Enable GitHub Pages:**

1. Open your GitHub repository.
2. Navigate to **Settings → Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Select the `main` branch.
5. Select `/(root)` as the folder.
6. Click **Save**.

**4. Access your deployed game:**

Once GitHub Pages finishes deploying, visit:

https://anthonybaldoza.github.io/Squid-Game-Redlight-Greenlight/

---

## 📁 Project Structure

```text
Squid-Game-Redlight-Greenlight/
│
├── index.html
├── style.css
│
└── js/
    ├── main.js
    ├── game.js
    ├── player.js
    ├── models.js
    ├── doll.js
    ├── environment.js
    ├── contestants.js
    ├── particles.js
    ├── audio.js
    ├── settings.js
    ├── share.js
    └── ui.js
```

### File Descriptions

| File             | Description                                                    |
| :--------------- | :------------------------------------------------------------- |
| `index.html`     | Main markup, screens, HUD, and Three.js import map             |
| `style.css`      | Menu styling, HUD, and touch controls                          |
| `main.js`        | Renderer, adaptive resolution, and main game loop              |
| `game.js`        | Game state, timers, Red Light detection, and win/lose logic    |
| `player.js`      | Player movement, keyboard, mouse, touch, and camera            |
| `models.js`      | Shared Roblox-style body parts for the player and contestants  |
| `doll.js`        | 3D robotic doll with animated head and body movement           |
| `environment.js` | Arena, sky, field, track, walls, and watchtowers               |
| `contestants.js` | AI-controlled contestants                                      |
| `particles.js`   | Death effects (splatter, shockwave, stains, tracers), confetti |
| `audio.js`       | Procedural sound effects and background music                  |
| `settings.js`    | Graphics presets and saved settings                            |
| `share.js`       | Result card image and Facebook / system sharing                |
| `ui.js`          | Menus, HUD, and notifications                                  |

---

## 🛠️ Customization

You can modify several gameplay settings directly in the JavaScript files.

| Feature                          | File                | Configuration           |
| :------------------------------- | :------------------ | :---------------------- |
| Time Limit                       | `js/game.js`        | `LIMIT`                 |
| Reaction Window                  | `js/game.js`        | `GRACE`                 |
| Slide-out Forgiveness            | `js/game.js`        | `SLIDE`                 |
| Chant Speed (Green Light length) | `js/game.js`        | `beginGreen()` (`rate`) |
| Chant Melody & Lyrics            | `js/audio.js`       | `CHANT`                 |
| Red Light Duration               | `js/game.js`        | `beginRed()`            |
| Track Length                     | `js/environment.js` | `ARENA.finishZ`         |
| AI Speed                         | `js/contestants.js` | AI movement settings    |
| Elimination Odds                 | `js/contestants.js` | AI elimination settings |

---

## 🔧 Troubleshooting

**Blank Page or "Could not start the game"**

- Run the project using HTTP or HTTPS.
- Do not open `index.html` directly using `file://`.
- Make sure `cdn.jsdelivr.net` is accessible.

**Low FPS / Performance Issues**

- Open Settings.
- Change the graphics preset to LOW.

**No Sound**

- Browsers require user interaction before playing audio.
- Click or tap the PLAY button to activate audio.

---

## 💻 Technologies Used

- HTML5
- CSS3
- Vanilla JavaScript (ES Modules)
- Three.js 0.160.0
- Web Audio API
- GitHub Pages
- Browser Local Storage

---

## 📜 License

This project is an independently developed browser game inspired by the Red Light, Green Light concept.

---

**Developed by Anthony Baldoza**
