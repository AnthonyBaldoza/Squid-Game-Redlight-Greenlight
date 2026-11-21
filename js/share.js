// Result card + sharing. On phones this opens the system share sheet (Facebook, Messenger, ...) with the image.
// On desktop it saves the image, copies it to the clipboard and opens the Facebook share dialog for the game link.
const W = 1200,
  H = 630;
const FONT = '"Bebas Neue", Impact, "Arial Narrow", sans-serif';
const UIF = 'Rajdhani, "Segoe UI", system-ui, sans-serif';

function drawCover(x, img) {
  const s = Math.max(W / img.width, H / img.height),
    w = img.width * s,
    h = img.height * s;
  x.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

export function buildCard(frame, r) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d");
  x.fillStyle = "#0b0b12";
  x.fillRect(0, 0, W, H);
  if (frame && frame.width) drawCover(x, frame);

  let g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, "rgba(5,5,15,0.9)");
  g.addColorStop(0.6, "rgba(5,5,15,0.5)");
  g.addColorStop(1, "rgba(5,5,15,0.15)");
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  g = x.createLinearGradient(0, H * 0.55, 0, H);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.65)");
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);

  x.textAlign = "left";
  x.textBaseline = "alphabetic";
  x.shadowColor = "rgba(0,0,0,0.6)";
  x.shadowBlur = 12;
  x.font = "110px " + FONT;
  x.fillStyle = "#ff2b3a";
  x.fillText("RED LIGHT", 60, 140);
  x.fillStyle = "#22d46a";
  x.fillText("GREEN LIGHT", 60, 245);

  x.font = "150px " + FONT;
  x.fillStyle = r.won ? "#22d46a" : "#ff2b3a";
  x.fillText(r.won ? "YOU SURVIVED" : "ELIMINATED", 60, 420);

  x.font = "600 44px " + UIF;
  x.fillStyle = "#ffffff";
  const line = r.won
    ? "TIME " +
      r.time.toFixed(2) +
      "s   ·   BEST " +
      r.best.toFixed(2) +
      "s" +
      (r.isNew ? "   ·   NEW RECORD!" : "")
    : "REACHED " + r.meters + " m / 100 m";
  x.fillText(line, 62, 492);

  x.font = "600 28px " + UIF;
  x.fillStyle = "rgba(255,255,255,0.9)";
  x.fillText("PLAYER 456  ·  Can you beat me?", 62, 575);
  x.textAlign = "right";
  x.fillText(
    location.host
      ? location.host + location.pathname.replace(/index\.html$/, "")
      : "Red Light, Green Light",
    W - 50,
    575,
  );
  return c;
}

function toFile(card) {
  const b = atob(card.toDataURL("image/png").split(",")[1]),
    u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return new File([u], "red-light-green-light.png", { type: "image/png" });
}

export function shareResult(frame, r, toast) {
  if (!r) return;
  const file = toFile(buildCard(frame, r));
  const url = location.href.split("#")[0];
  const text = r.won
    ? "I survived Red Light, Green Light in " +
      r.time.toFixed(2) +
      "s! Can you beat my time?"
    : "I got eliminated " +
      r.meters +
      " m from the start in Red Light, Green Light. Can you do better?";

  // Phones / browsers that can share files: system share sheet (pick Facebook, Messenger, ...)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator
      .share({
        files: [file],
        title: "Red Light, Green Light",
        text: text + " " + url,
      })
      .catch(() => {
        /* cancelled */
      });
    return;
  }

  // Desktop: open Facebook's share dialog (must happen directly inside the click), save + copy the image
  window.open(
    "https://www.facebook.com/sharer/sharer.php?u=" +
      encodeURIComponent(url) +
      "&quote=" +
      encodeURIComponent(text),
    "_blank",
    "noopener",
  );
  try {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (e) {
    /* ignore */
  }
  try {
    if (window.ClipboardItem && navigator.clipboard)
      navigator.clipboard
        .write([new ClipboardItem({ "image/png": file })])
        .catch(() => {});
  } catch (e) {
    /* ignore */
  }
  if (toast)
    toast(
      "Image saved & copied. Paste it (Ctrl+V) or attach it to your Facebook post!",
    );
}
