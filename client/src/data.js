// Client-side reference data (ids match the server catalog).

export const CATEGORIES = [
  { id: 'laptop', ar: 'لابتوب', fr: 'Ordinateurs portables', image: '/img/products/cat-laptop.webp' },
  { id: 'gpu', ar: 'كرت الشاشة', fr: 'Cartes graphiques', image: '/img/products/cat-gpu.webp' },
  { id: 'cpu', ar: 'المعالج', fr: 'Processeurs', image: '/img/products/cat-cpu.webp' },
  { id: 'ram', ar: 'الذاكرة', fr: 'Mémoire RAM', image: '/img/products/cat-ram.webp' },
  { id: 'storage', ar: 'التخزين', fr: 'Stockage', image: '/img/products/cat-storage.webp' },
  { id: 'monitor', ar: 'الشاشة', fr: 'Écrans', image: '/img/products/cat-monitor.webp' },
  { id: 'keyboard', ar: 'لوحة المفاتيح', fr: 'Claviers', image: '/img/products/cat-keyboard.webp' },
  { id: 'mouse', ar: 'الفأرة', fr: 'Souris', image: '/img/products/cat-mouse.webp' },
  { id: 'headset', ar: 'سماعة الرأس', fr: 'Casques', image: '/img/products/cat-headset.webp' },
  { id: 'psu', ar: 'مزود الطاقة', fr: 'Alimentations', image: '/img/products/cat-psu.webp' },
];

export const WILAYAS_RAW = `01|طنجة تطوان الحسيمة|Tanger-Tétouan-Al Hoceïma
02|الشرق|L'Oriental
03|فاس مكناس|Fès-Meknès
04|الرباط سلا القنيطرة|Rabat-Salé-Kénitra
05|بني ملال خنيفرة|Béni Mellal-Khénifra
06|الدار البيضاء سطات|Casablanca-Settat
07|مراكش آسفي|Marrakech-Safi
08|درعة تافيلالت|Drâa-Tafilalet
09|سوس ماسة|Souss-Massa
10|كلميم واد نون|Guelmim-Oued Noun
11|العيون الساقية الحمراء|Laâyoune-Sakia El Hamra
12|الداخلة وادي الذهب|Dakhla-Oued Ed-Dahab`;

export const WILAYAS = WILAYAS_RAW.split('\n').map((line) => {
  const [code, ar, fr] = line.split('|');
  return { code, ar, fr };
});
