/* Desktop presentation. Builder logic and mobile preferences remain shared. */
(() => {
  'use strict';
  const mq = matchMedia('(min-width: 1024px)');
  const root = document.documentElement;
  const t = (ja, en) => ja; // Original text is translated by refreshLabels.
  let mobilePin = root.classList.contains('nopin'), active = false;
  const originals = new WeakMap();
  const prior = history.state?.crdbBuilder;
  let built = false, pinned = !!(prior?.version === 1 && prior.url === location.pathname + location.search && prior.pinned);
  const copy = {
  "ja": [
    "デッキ作成",
    "人気デッキ",
    "デッキ分析",
    "マイページ",
    "使い方ガイド",
    "支援",
    "お問い合わせ",
    "その8枚に、勝ち筋を。",
    "選ぶ。組み替える。自分だけのデッキを磨こう。",
    "カードを選ぶ",
    "デッキを分析",
    "アリーナへ",
    "デッキを固定",
    "固定を解除",
    "カードをクリックして追加・入れ替え",
    "8枚でデッキ完成",
    "次の1枚を見つけよう",
    "検索ショートカット",
    "カードを追加",
    "明るい背景 / 暗い背景",
    "メインメニュー",
    "外す",
    "空きスロット"
  ],
  "en": [
    "Deck builder",
    "Popular decks",
    "Deck analysis",
    "My profile",
    "Guide",
    "Support",
    "Contact",
    "Find your winning eight.",
    "Pick, refine, and make the deck your own.",
    "Pick cards",
    "Find insights",
    "Play",
    "Pin deck",
    "Unpin deck",
    "Click a card to add or replace it",
    "Eight cards. One deck.",
    "Find your next card",
    "Quick search",
    "Add a card",
    "Switch appearance",
    "Main navigation",
    "Remove",
    "Empty slot"
  ],
  "es": [
    "Crear mazo",
    "Mazos populares",
    "Analizar mazo",
    "Mi perfil",
    "Guía",
    "Apoyar",
    "Contacto",
    "Encuentra tus ocho ganadoras.",
    "Elige, ajusta y crea tu propio mazo.",
    "Elige cartas",
    "Analiza el mazo",
    "A la arena",
    "Fijar mazo",
    "Desfijar mazo",
    "Haz clic para añadir o cambiar cartas",
    "Ocho cartas. Un mazo.",
    "Encuentra tu próxima carta",
    "Búsqueda rápida",
    "Añadir carta",
    "Cambiar apariencia",
    "Menú principal",
    "Quitar",
    "Espacio libre"
  ],
  "pt-br": [
    "Criar deck",
    "Decks populares",
    "Analisar deck",
    "Meu perfil",
    "Guia",
    "Apoiar",
    "Contato",
    "Encontre suas oito vencedoras.",
    "Escolha, ajuste e crie seu próprio deck.",
    "Escolha cartas",
    "Analise o deck",
    "Para a arena",
    "Fixar deck",
    "Soltar deck",
    "Clique para adicionar ou trocar cartas",
    "Oito cartas. Um deck.",
    "Encontre sua próxima carta",
    "Busca rápida",
    "Adicionar carta",
    "Mudar aparência",
    "Menu principal",
    "Remover",
    "Espaço vazio"
  ],
  "fr": [
    "Créer un deck",
    "Decks populaires",
    "Analyse",
    "Mon profil",
    "Guide",
    "Soutenir",
    "Contact",
    "Trouvez vos huit cartes gagnantes.",
    "Choisissez, ajustez et créez votre deck.",
    "Choisir",
    "Analyser",
    "Jouer",
    "Épingler",
    "Détacher",
    "Cliquez pour ajouter ou remplacer une carte",
    "Huit cartes. Un deck.",
    "Trouvez votre prochaine carte",
    "Recherche rapide",
    "Ajouter une carte",
    "Changer le thème",
    "Menu principal",
    "Retirer",
    "Emplacement vide"
  ],
  "de": [
    "Deck bauen",
    "Beliebte Decks",
    "Deck-Analyse",
    "Mein Profil",
    "Anleitung",
    "Unterstützen",
    "Kontakt",
    "Finde deine acht Gewinner.",
    "Wähle, verfeinere und baue dein eigenes Deck.",
    "Karten wählen",
    "Deck analysieren",
    "Spielen",
    "Deck anheften",
    "Deck lösen",
    "Klicken, um Karten hinzuzufügen oder zu tauschen",
    "Acht Karten. Ein Deck.",
    "Finde deine nächste Karte",
    "Schnellsuche",
    "Karte hinzufügen",
    "Darstellung wechseln",
    "Hauptmenü",
    "Entfernen",
    "Freier Platz"
  ],
  "ru": [
    "Создать колоду",
    "Популярные",
    "Анализ",
    "Мой профиль",
    "Руководство",
    "Поддержать",
    "Контакты",
    "Найди свою победную восьмёрку.",
    "Выбирай, меняй и совершенствуй свою колоду.",
    "Выбери карты",
    "Анализируй",
    "На арену",
    "Закрепить",
    "Открепить",
    "Нажми на карту, чтобы добавить или заменить её",
    "Восемь карт. Одна колода.",
    "Найди следующую карту",
    "Быстрый поиск",
    "Добавить карту",
    "Сменить тему",
    "Главное меню",
    "Убрать",
    "Свободное место"
  ],
  "ko": [
    "덱 만들기",
    "인기 덱",
    "덱 분석",
    "내 프로필",
    "가이드",
    "후원",
    "문의",
    "승리할 8장을 찾아보세요.",
    "고르고 바꾸며 나만의 덱을 완성하세요.",
    "카드 선택",
    "덱 분석",
    "아레나로",
    "덱 고정",
    "고정 해제",
    "카드를 클릭해 추가하거나 교체하세요",
    "8장으로 덱 완성",
    "다음 카드를 찾아보세요",
    "빠른 검색",
    "카드 추가",
    "밝은 / 어두운 배경",
    "주 메뉴",
    "제거",
    "빈 슬롯"
  ],
  "zh-cn": [
    "构筑卡组",
    "热门卡组",
    "卡组分析",
    "个人主页",
    "使用指南",
    "支持",
    "联系我们",
    "找到你的制胜八张。",
    "选择、调整，打造自己的卡组。",
    "选择卡牌",
    "分析卡组",
    "进入竞技场",
    "固定卡组",
    "取消固定",
    "点击卡牌添加或替换",
    "八张卡牌，一套卡组",
    "寻找下一张卡牌",
    "快捷搜索",
    "添加卡牌",
    "切换明暗主题",
    "主菜单",
    "移除",
    "空卡槽"
  ],
  "ar": [
    "بناء تشكيلة",
    "تشكيلات شائعة",
    "تحليل التشكيلة",
    "ملفي",
    "دليل",
    "دعم",
    "تواصل",
    "اعثر على ثماني بطاقات للفوز.",
    "اختر وعدّل واصنع تشكيلتك الخاصة.",
    "اختر البطاقات",
    "حلّل التشكيلة",
    "إلى الساحة",
    "تثبيت التشكيلة",
    "إلغاء التثبيت",
    "انقر لإضافة بطاقة أو استبدالها",
    "ثماني بطاقات. تشكيلة واحدة.",
    "اعثر على بطاقتك التالية",
    "بحث سريع",
    "إضافة بطاقة",
    "تغيير المظهر",
    "القائمة الرئيسية",
    "إزالة",
    "خانة فارغة"
  ],
  "tr": [
    "Deste oluştur",
    "Popüler desteler",
    "Deste analizi",
    "Profilim",
    "Rehber",
    "Destek",
    "İletişim",
    "Kazandıran sekiz kartını bul.",
    "Seç, düzenle ve kendi desteni oluştur.",
    "Kart seç",
    "Desteni incele",
    "Arenaya gir",
    "Desteyi sabitle",
    "Sabitlemeyi kaldır",
    "Eklemek veya değiştirmek için karta tıkla",
    "Sekiz kart. Tek deste.",
    "Sıradaki kartını bul",
    "Hızlı arama",
    "Kart ekle",
    "Görünümü değiştir",
    "Ana menü",
    "Kaldır",
    "Boş yuva"
  ],
  "it": [
    "Crea mazzo",
    "Mazzi popolari",
    "Analisi",
    "Il mio profilo",
    "Guida",
    "Sostieni",
    "Contatti",
    "Trova le tue otto carte vincenti.",
    "Scegli, perfeziona e crea il tuo mazzo.",
    "Scegli carte",
    "Analizza",
    "Nell’arena",
    "Fissa mazzo",
    "Sblocca mazzo",
    "Clicca per aggiungere o sostituire una carta",
    "Otto carte. Un mazzo.",
    "Trova la prossima carta",
    "Ricerca rapida",
    "Aggiungi carta",
    "Cambia tema",
    "Menu principale",
    "Rimuovi",
    "Spazio vuoto"
  ],
  "id": [
    "Buat dek",
    "Dek populer",
    "Analisis dek",
    "Profil saya",
    "Panduan",
    "Dukung",
    "Kontak",
    "Temukan delapan kartu pemenangmu.",
    "Pilih, sesuaikan, dan buat dek sendiri.",
    "Pilih kartu",
    "Analisis dek",
    "Ke arena",
    "Sematkan dek",
    "Lepaskan dek",
    "Klik kartu untuk menambah atau mengganti",
    "Delapan kartu. Satu dek.",
    "Temukan kartu berikutnya",
    "Pencarian cepat",
    "Tambah kartu",
    "Ubah tampilan",
    "Menu utama",
    "Hapus",
    "Slot kosong"
  ],
  "th": [
    "สร้างเด็ค",
    "เด็คยอดนิยม",
    "วิเคราะห์เด็ค",
    "โปรไฟล์ของฉัน",
    "คู่มือ",
    "สนับสนุน",
    "ติดต่อ",
    "ค้นหา 8 ใบสู่ชัยชนะ",
    "เลือก ปรับเปลี่ยน และสร้างเด็คของคุณเอง",
    "เลือกการ์ด",
    "วิเคราะห์เด็ค",
    "สู่สนามประลอง",
    "ตรึงเด็ค",
    "เลิกตรึงเด็ค",
    "คลิกการ์ดเพื่อเพิ่มหรือเปลี่ยน",
    "8 ใบ หนึ่งเด็ค",
    "ค้นหาการ์ดใบต่อไป",
    "ค้นหาด่วน",
    "เพิ่มการ์ด",
    "เปลี่ยนธีม",
    "เมนูหลัก",
    "นำออก",
    "ช่องว่าง"
  ],
  "vi": [
    "Tạo bộ bài",
    "Bộ bài phổ biến",
    "Phân tích",
    "Hồ sơ",
    "Hướng dẫn",
    "Ủng hộ",
    "Liên hệ",
    "Tìm tám lá bài chiến thắng.",
    "Chọn, tinh chỉnh và tạo bộ bài của bạn.",
    "Chọn bài",
    "Phân tích",
    "Vào đấu trường",
    "Ghim bộ bài",
    "Bỏ ghim",
    "Nhấp để thêm hoặc thay lá bài",
    "Tám lá bài. Một bộ bài.",
    "Tìm lá bài tiếp theo",
    "Tìm nhanh",
    "Thêm bài",
    "Đổi giao diện",
    "Menu chính",
    "Xóa",
    "Ô trống"
  ],
  "zh-tw": [
    "構築牌組",
    "熱門牌組",
    "牌組分析",
    "個人主頁",
    "使用指南",
    "支持",
    "聯絡我們",
    "找到你的致勝八張。",
    "選擇、調整，打造自己的牌組。",
    "選擇卡牌",
    "分析牌組",
    "進入競技場",
    "固定牌組",
    "取消固定",
    "點擊卡牌新增或替換",
    "八張卡牌，一套牌組",
    "尋找下一張卡牌",
    "快速搜尋",
    "新增卡牌",
    "切換明暗主題",
    "主選單",
    "移除",
    "空卡槽"
  ],
  "fa": [
    "ساخت دک",
    "دک‌های محبوب",
    "تحلیل دک",
    "پروفایل من",
    "راهنما",
    "حمایت",
    "تماس",
    "هشت کارت برنده‌ات را پیدا کن.",
    "انتخاب کن، تغییر بده و دک خودت را بساز.",
    "انتخاب کارت",
    "تحلیل دک",
    "ورود به میدان",
    "ثابت کردن دک",
    "آزاد کردن دک",
    "برای افزودن یا تعویض کارت کلیک کن",
    "هشت کارت. یک دک.",
    "کارت بعدی را پیدا کن",
    "جستجوی سریع",
    "افزودن کارت",
    "تغییر ظاهر",
    "منوی اصلی",
    "حذف",
    "جای خالی"
  ],
  "nl": [
    "Deck bouwen",
    "Populaire decks",
    "Deckanalyse",
    "Mijn profiel",
    "Gids",
    "Steunen",
    "Contact",
    "Vind jouw acht winnaars.",
    "Kies, verfijn en maak je eigen deck.",
    "Kies kaarten",
    "Analyseer",
    "Naar de arena",
    "Deck vastzetten",
    "Deck losmaken",
    "Klik om een kaart toe te voegen of te wisselen",
    "Acht kaarten. Eén deck.",
    "Vind je volgende kaart",
    "Snel zoeken",
    "Kaart toevoegen",
    "Thema wisselen",
    "Hoofdmenu",
    "Verwijderen",
    "Lege plek"
  ]
};
  const copyKeys = copy.ja;
  const svg = (body) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const icons = {
    build: svg('<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M12 8v8M8 12h8"/>'),
    chart: svg('<path d="M4 4v16h16M8 15v-3m4 3V8m4 7V5"/>'),
    trophy: svg('<path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v3a3 3 0 0 0 3 3m10-6h3v3a3 3 0 0 1-3 3M12 14v6m-4 0h8"/>'),
    user: svg('<circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>'),
    book: svg('<path d="M12 5C8 3 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-5-1-9 1v15"/>'),
    heart: svg('<path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1C-2 11 12 21 12 21S26 11 20 5z"/>'),
    mail: svg('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>'),
    pin: svg('<path d="M9 3h6m-5 0v6l-4 5h12l-4-5V3M12 14v7"/>'),
    arrow: svg('<path d="M5 12h14m-5-5 5 5-5 5"/>'),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>')
  };
  const make = (tag, cls, html) => { const el = document.createElement(tag); el.className = cls; if (html) el.innerHTML = html; if (cls.includes('dp-only')) el.setAttribute('data-no-i18n', ''); return el; };
  const path = location.pathname;
  const prefix = path.match(/^\/(en|es|pt-br|fr|de|ru|ko|zh-cn|ar|tr|it|id|th|vi|zh-tw|fa|nl)\//)?.[0] || '/';
  const current = path.split('/').pop() || 'index.html';

  function build() {
    built = true;
    const header = document.querySelector('header');
    if (!header) return;
    const theme = make('button', 'dp-theme dp-only', icons.sun);
    theme.type = 'button'; theme.title = t('明るい背景 / 暗い背景', 'Switch appearance');
    theme.setAttribute('aria-label', theme.title);
    theme.addEventListener('click', () => {
      const light = root.classList.toggle('light');
      try { localStorage.setItem('cr_theme', light ? 'light' : 'dark'); } catch {}
    });
    header.append(theme);

    const nav = make('nav', 'dp-tabs dp-only');
    nav.setAttribute('aria-label', t('メインメニュー', 'Main navigation'));
    const entries = [
      ['index.html', 'build', 'デッキ作成', 'Deck builder'],
      ['decks.html', 'trophy', '人気デッキ', 'Popular decks'],
      ['strategy.html', 'chart', 'デッキ分析', 'Deck analysis'],
      ['me.html', 'user', 'マイページ', 'My profile'],
      ['guide.html', 'book', '使い方ガイド', 'Guide'],
      ['support.html', 'heart', '支援', 'Support'],
      ['contact.html', 'mail', 'お問い合わせ', 'Contact'],
    ];
    for (const [url, icon, jp, en] of entries) {
      const a = make('a', 'dp-tab', `${icons[icon]}<span>${t(jp, en)}</span>`);
      a.href = url === 'me.html' ? '/me.html' : prefix + url;
      if (url === current) { a.classList.add('active'); a.setAttribute('aria-current', 'page'); }
      nav.append(a);
    }
    header.after(nav);
    if (header.closest('.sitebar')) nav.classList.add('dp-tabs-inbar');
    nav.querySelectorAll('.dp-tab').forEach(a => {
      a.addEventListener('click', () => {
        if (a.getAttribute('href') === prefix + 'strategy.html') {
          const original = document.querySelector('#analyzeBtn');
          if (original) a.href = original.href;
        } else if (a.getAttribute('href') === prefix + 'index.html') {
          const back = document.querySelector('#backToBuilder');
          if (back) a.href = back.href;
        }
      });
    });

    const footer = document.querySelector('.footer-signature');
    if (footer) {
      const stamp = make('span', 'dp-footnote dp-only', 'CR DECK BUILDERS <span> / </span> BUILD YOUR NEXT WIN.');
      footer.prepend(stamp);

    }

    const app = document.querySelector('body.cr-builder .app');
    if (app) {
      const hero = make('section', 'dp-intro dp-only', `<div><div class="dp-eyebrow"><span></span> DECK WORKSPACE</div><h1>${t('その8枚に、勝ち筋を。', 'Find your winning eight.')}</h1><p>${t('選ぶ。組み替える。自分だけのデッキを磨こう。', 'Pick, refine, and make the deck your own.')}</p></div><div class="dp-intro-note"><span>01</span> ${t('カードを選ぶ', 'Pick cards')}<i>—</i><span>02</span> ${t('デッキを分析', 'Find insights')}<i>—</i><span>03</span> ${t('アリーナへ', 'Play')}</div>`);
      app.before(hero);
      const dh = app.querySelector('.deck-header');
      const label = make('span', 'dp-section-label dp-only', 'YOUR DECK');
      dh.prepend(label);
      const pin = make('button', 'dp-pin dp-only', icons.pin + `<span>${t('デッキを固定', 'Pin deck')}</span>`);
      pin.type = 'button'; pin.setAttribute('aria-pressed', String(pinned));
      pin.addEventListener('click', () => {
        pinned = !pinned; root.classList.toggle('nopin', !pinned);
        pin.setAttribute('aria-pressed', String(pinned));
        pin.querySelector('span').textContent = translate(pinned ? '固定を解除' : 'デッキを固定');
      });
      dh.append(pin);
      const guide = make('div', 'dp-deck-guide dp-only', `<span>${t('カードをクリックして追加・入れ替え', 'Click a card to add or replace it')}</span><span>${t('8枚でデッキ完成', 'Eight cards. One deck.')}</span>`);
      app.querySelector('.deck-slots').after(guide);
      const lib = make('div', 'dp-library-title dp-only', `<div><span class="dp-section-label">CARD LIBRARY</span><h2>${t('次の1枚を見つけよう', 'Find your next card')}</h2></div><span>${t('検索ショートカット', 'Quick search')} <kbd>/</kbd></span>`);
      app.querySelector('.left').prepend(lib);
      const search = app.querySelector('#search');
      search?.setAttribute('aria-label', t('カード名・略称で検索', 'Search cards'));

      function decorate() {
        if (!mq.matches) return;
        app.querySelectorAll('#deckSlots > .slot').forEach((el, i) => {
          el.querySelector('.dp-slot-label')?.remove();
          const c = typeof deck !== 'undefined' ? deck[i] : null;
          const caption = make('span', 'dp-slot-label dp-only');
          caption.textContent = c ? (typeof cardName === 'function' ? cardName(c) : c.name) : t('カードを追加', 'Add a card');
          el.append(caption);
          el.setAttribute('aria-label', c ? translate('外す') + ': ' + caption.textContent : translate('空きスロット') + ' ' + (i + 1));
          el.setAttribute('tabindex', c ? '0' : '-1');
          if (c) el.setAttribute('role', 'button'); else el.removeAttribute('role');
          el.dataset.dpIndex = String(i + 1).padStart(2, '0');
        });
        app.querySelectorAll('#cardList > .card').forEach(el => {
          el.tabIndex = 0; el.setAttribute('role', 'button');
          el.setAttribute('aria-label', el.querySelector('.card-name')?.textContent || el.dataset.name);
        });
        refreshLabels();
      }
      const observer = new MutationObserver(records => {
        if (records.some(r => r.target.id === 'deckSlots' || r.target.id === 'cardList')) decorate();
        if (mq.matches) app.querySelectorAll('.card-actions .ca-detail').forEach(link => {
          const slug = link.getAttribute('href')?.match(/(?:^|\/)cards\/([a-z0-9-]+\.html)$/)?.[1];
          if (slug) link.href = '/cards/' + slug;
        });
      });
      observer.observe(app, {childList: true, subtree: true});
      decorate();
      app.addEventListener('keydown', e => {
        if (!root.classList.contains('dp-desktop') || (e.key !== 'Enter' && e.key !== ' ')) return;
        if (e.target.matches('.card, .slot.filled')) { e.preventDefault(); e.target.click(); }
      });
      document.addEventListener('keydown', e => {
        if (!root.classList.contains('dp-desktop') || e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.activeElement.isContentEditable) return;
        if (search && getComputedStyle(search).display !== 'none') { e.preventDefault(); search.focus(); search.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}); }
      });
    }
  }

  function translate(text) {
    const lang = window.CRI18N?.lang || root.lang.toLowerCase();
    const index = copyKeys.indexOf(text);
    if (index >= 0) return (copy[lang] || copy.en)[index];
    return window.CRI18N?.tr(text) || text;
  }
  function refreshLabels() {
    if (!mq.matches) return;
    document.querySelectorAll('.dp-only').forEach(el => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!originals.has(node)) originals.set(node, node.nodeValue);
        const source = originals.get(node), key = source.trim();
        const translated = source.replace(key, translate(key));
        if (node.nodeValue !== translated) node.nodeValue = translated;
      }
    });
    document.querySelectorAll('#deckSlots > .slot').forEach((el, i) => {
      const label = el.querySelector('.dp-slot-label')?.textContent;
      el.setAttribute('aria-label', el.classList.contains('filled') ? translate('外す') + ': ' + label : translate('空きスロット') + ' ' + (i + 1));
    });
    document.querySelectorAll('#cardList > .card').forEach(el => el.setAttribute('aria-label', el.querySelector('.card-name')?.textContent || el.dataset.name));
    const search = document.querySelector('#search');
    if (search) search.setAttribute('aria-label', search.placeholder);
    const theme = document.querySelector('.dp-theme');
    if (theme) theme.title = translate('明るい背景 / 暗い背景');
    theme?.setAttribute('aria-label', theme.title);
    document.querySelector('.dp-tabs')?.setAttribute('aria-label', translate('メインメニュー'));
    const pin = document.querySelector('.dp-pin span');
    if (pin) { pin.textContent = translate(pinned ? '固定を解除' : 'デッキを固定'); originals.delete(pin.firstChild); }
  }
  function refresh() {
    const enabled = mq.matches;
    if (enabled && !active) mobilePin = root.classList.contains('nopin');
    root.classList.toggle('dp-desktop', enabled);
    if (enabled && !built) build();
    if (enabled) root.classList.toggle('nopin', !pinned);
    else if (active) root.classList.toggle('nopin', mobilePin);
    active = enabled;
    refreshLabels();
  }
  window.addEventListener('crlangchange', refreshLabels);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, {once:true});
  else refresh();
  mq.addEventListener('change', refresh);
})();
