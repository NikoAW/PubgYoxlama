export const RULES = {
  cheatApp:            { pts: 40, label: "Məlum cheat/mod tətbiqi quraşdırılıb" },
  pubgSignature:       { pts: 40, label: "PUBG imzası rəsmi versiya ilə uyğun gəlmir" },
  pubgModifiedFiles:   { pts: 30, label: "PUBG qovluğunda əlavə və ya dəyişdirilmiş fayl" },
  pubgSideloaded:      { pts: 25, label: "PUBG Play Store-dan deyil, kənar APK-dan" },
  virtualEnv:          { pts: 25, label: "Virtual mühit tətbiqi aşkarlanıb" },
  playIntegrity:       { pts: 20, label: "Play Integrity uğursuz" },
  root:                { pts: 20, label: "Root aşkarlanıb" },
  emulator:            { pts: 15, label: "Emulyator aşkarlanıb" },
  macroOverlay:        { pts: 10, label: "Overlay, auto-click və ya macro tətbiqi" },
  bootloaderCustomRom: { pts: 10, label: "Unlocked bootloader və ya custom ROM" },
  devOptionsAdb:       { pts: 0,  label: "Developer options / USB debugging aktivdir" }
};

export function level(score) {
  if (score >= 80) return "ÇOX YÜKSƏK RİSK";
  if (score >= 50) return "YÜKSƏK RİSK";
  if (score >= 20) return "ORTA RİSK";
  return "AŞAĞI RİSK";
}

export function evaluate(results, complete) {
  if (!complete) return { score: null, status: "MƏLUMATLAR TAM ÖTÜRÜLMƏYİB", reasons: [] };
  let score = 0; const reasons = [];
  for (const [k, r] of Object.entries(RULES)) {
    const v = results[k];
    const state = v === true ? "aşkarlandı" : v === false ? "aşkarlanmadı" : "Yoxlanılmadı";
    if (v === true) score += r.pts;
    reasons.push({ key: k, label: r.label, pts: r.pts, state });
  }
  score = Math.min(100, score);
  return { score, level: level(score), warn: score >= 80 ? "TÖVSİYƏ EDİLMİR!" : null, reasons };
}
