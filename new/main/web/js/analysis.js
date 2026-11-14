const INTRO = {
  low: ["Bu cihazda ciddi risk göstəricisi aşkar edilməyib.", "Yoxlanılan göstəricilər nisbətən sakit görünür.", "Əldə edilən nəticələr aşağı risk səviyyəsini göstərir.", "Cihazın texniki vəziyyəti normal həddə görünür.", "Aşkar edilmiş risk siqnalı çox azdır."],
  mid: ["Bu cihazda əlavə baxış tələb edən bəzi göstəricilər var.", "Nəticələrdə orta səviyyəli risk siqnalları müşahidə olunur.", "Cihazda diqqət tələb edən texniki göstəricilər aşkarlanıb.", "Yoxlama bəzi qeyri-standart halları üzə çıxarıb.", "Risk göstəriciləri orta səviyyədədir."],
  high: ["Bu cihazda əlavə yoxlama tələb edən göstəricilər aşkar edilib.", "Nəticələrdə yüksək risk siqnalları qeydə alınıb.", "Cihazda bir neçə ciddi göstərici müşahidə olunur.", "Yoxlama yüksək risk səviyyəsinə işarə edən hallar tapıb.", "Aşkarlanan siqnallar diqqətli nəzərdən keçirilməlidir."],
  vhigh: ["Nəticələr çox yüksək risk göstəricisi ilə nəticələnib.", "Bu cihazda bir çox risk siqnalı eyni anda aşkarlanıb.", "Cihazın göstəriciləri sövdələşmə üçün ehtiyatlı olmağı tələb edir.", "Risk göstəriciləri kritik həddə yaxındır.", "Yoxlama çox sayda ciddi siqnal qeydə alıb."]
};
const DETAIL = [(l) => l.length ? `Aşkarlanan göstəricilər: ${l.join(', ')}.` : "Aşkarlanan konkret göstərici yoxdur.",
  (l) => l.length ? `Qeydə alınan siqnallar bunlardır: ${l.join('; ')}.` : "Heç bir risk siqnalı qeydə alınmayıb.",
  (l) => `Ümumilikdə ${l.length} göstərici risk balına təsir edib.`,
  (l) => l.length ? `Əsas diqqət çəkən məqam: ${l[0]}.` : "Diqqət çəkən xüsusi məqam yoxdur."];
const END = ["Bu nəticə ehtimal və risk göstəricisidir, qəti hökm deyil.", "Göstəricilər cheat istifadəsinin qəti sübutu hesab edilməməlidir.", "Yoxlanılmayan göstəricilər nəticəyə daxil edilməyib.", "Qərar verməzdən əvvəl scanner əlavə sual verə bilər.", "Nəticə yalnız cihazdan əldə edilmiş texniki məlumata əsaslanır."];
const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
export function analyze(scan, code) {
  const s = scan.score, lv = s >= 80 ? 'vhigh' : s >= 50 ? 'high' : s >= 20 ? 'mid' : 'low';
  const hit = (scan.reasons || []).filter(x => x.state === 'aşkarlandı' && x.pts > 0).map(x => x.label);
  const unk = (scan.reasons || []).filter(x => x.state === 'Yoxlanılmadı').length;
  const h = hash(code);
  let t = `${INTRO[lv][h % 5]} ${DETAIL[(h >> 3) % 4](hit)} ${END[(h >> 5) % 5]}`;
  if (unk) t += ` ${unk} göstərici yoxlanılmadığı üçün nəticə məhduddur.`;
  return t;
}
