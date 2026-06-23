#!/usr/bin/env node
/*
 * 海外SEO用：言語別の静的ページを生成する（依存ゼロ・純Node）。
 *  - 各言語フォルダ /<lang>/ に index/decks/strategy を出力
 *  - 各ページに その言語の <title>/<meta>/og:locale、<html lang>、hreflang一式、自己canonical
 *  - css/js 等の相対アセットはルート絶対(/css /js)へ書換（サブフォルダでも壊れない）
 *  - ルート(ja)ページにも hreflang を注入、sitemap.xml を全URL+alternateで再生成
 *  本文の翻訳は i18n.js がクライアント側で行う（パス /<lang>/ を検出して自動描画）。
 *  使い方： node tools/gen-i18n.js
 *  ※ 文字列内のアポストロフィは ’(U+2019) を使う（JSのシングルクォートを壊さないため）。
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const BASE = 'https://crdeckbuilders.com';

const TARGETS = ['en', 'es', 'pt-br', 'fr', 'de', 'ru', 'ko', 'zh-cn', 'ar', 'tr', 'it', 'id', 'th', 'vi', 'zh-tw', 'fa', 'nl'];
const ALL = ['ja'].concat(TARGETS);
const HTMLLANG = { ja: 'ja', en: 'en', es: 'es', 'pt-br': 'pt-BR', fr: 'fr', de: 'de', ru: 'ru', ko: 'ko', 'zh-cn': 'zh-CN', ar: 'ar', tr: 'tr', it: 'it', id: 'id', th: 'th', vi: 'vi', 'zh-tw': 'zh-TW', fa: 'fa', nl: 'nl' };
const HREFLANG = HTMLLANG;
const LOCALE = { ja: 'ja_JP', en: 'en_US', es: 'es_ES', 'pt-br': 'pt_BR', fr: 'fr_FR', de: 'de_DE', ru: 'ru_RU', ko: 'ko_KR', 'zh-cn': 'zh_CN', ar: 'ar_AR', tr: 'tr_TR', it: 'it_IT', id: 'id_ID', th: 'th_TH', vi: 'vi_VN', 'zh-tw': 'zh_TW', fa: 'fa_IR', nl: 'nl_NL' };
const PAGES = ['index.html', 'decks.html', 'strategy.html'];
const UTIL = ['support.html', 'contact.html', 'privacy.html'].filter(p => fs.existsSync(path.join(ROOT, p)));
const GEN = PAGES.concat(UTIL); // 生成対象。UTILはSEO文字列なし＝metaは日本語のまま、lang/hreflang/canonical/assetは付与（404回避＋言語内に留まる）
const TODAY = new Date().toISOString().slice(0, 10);

// 言語別SEO文字列（title / description / keywords）
const SEO = {
  'index.html': {
    en: { t: 'Clash Royale Deck Builder & Analyzer | CR Deck Builders', d: 'Free Clash Royale deck builder and analyzer. Pick 8 of all 121 cards, check average elixir and balance, and see top-ladder popular decks and win rates. Evolutions, Heroes and Champions supported.', k: 'clash royale,deck builder,clash royale decks,best decks,meta,win rate,evolution,champion,deck analyzer' },
    es: { t: 'Creador y Analizador de Mazos de Clash Royale | CR Deck Builders', d: 'Creador y analizador de mazos de Clash Royale gratis. Elige 8 de las 121 cartas, mira el coste medio y el equilibrio, y descubre los mazos populares y winrate del top mundial. Compatible con Evoluciones, Héroes y Campeones.', k: 'clash royale,mazos,mejores mazos,creador de mazos,meta,winrate,evolución,campeón' },
    'pt-br': { t: 'Criador e Analisador de Decks de Clash Royale | CR Deck Builders', d: 'Criador e analisador de decks de Clash Royale grátis. Escolha 8 das 121 cartas, veja o custo médio e o equilíbrio, e confira os decks populares e o winrate do topo mundial. Suporta Evoluções, Heróis e Campeões.', k: 'clash royale,decks,melhores decks,criador de decks,meta,winrate,evolução,campeão' },
    fr: { t: 'Créateur et Analyseur de Decks Clash Royale | CR Deck Builders', d: 'Créateur et analyseur de decks Clash Royale gratuit. Choisissez 8 cartes parmi 121, vérifiez le coût moyen et l’équilibre, et découvrez les decks populaires et le taux de victoire du top mondial. Évolutions, Héros et Champions pris en charge.', k: 'clash royale,decks,meilleurs decks,créateur de deck,méta,taux de victoire,évolution,champion' },
    de: { t: 'Clash Royale Deck-Builder & Analyse-Tool | CR Deck Builders', d: 'Kostenloser Clash Royale Deck-Builder und Analyse-Tool. Wähle 8 von 121 Karten, prüfe Durchschnittskosten und Balance und entdecke beliebte Decks und Winraten der Weltspitze. Evolutionen, Helden und Champions werden unterstützt.', k: 'clash royale,decks,beste decks,deck builder,meta,winrate,evolution,champion' },
    ru: { t: 'Билдер и анализатор колод Clash Royale | CR Deck Builders', d: 'Бесплатный билдер и анализатор колод Clash Royale. Выберите 8 из 121 карты, проверьте средний эликсир и баланс, смотрите популярные колоды и винрейты топа. Поддержка эволюций, героев и чемпионов.', k: 'clash royale,колоды,лучшие колоды,билдер колод,мета,винрейт,эволюция,чемпион' },
    ko: { t: '클래시 로얄 덱 빌더 & 분석기 | CR Deck Builders', d: '무료 클래시 로얄 덱 빌더 및 분석기. 121장 카드 중 8장을 골라 평균 코스트와 밸런스를 진단하고, 상위 랭커 인기 덱과 승률을 확인하세요. 진화·영웅·챔피언 지원.', k: '클래시로얄,덱,베스트 덱,덱 빌더,메타,승률,진화,챔피언' },
    'zh-cn': { t: '皇室战争卡组构建与分析器 | CR Deck Builders', d: '免费的皇室战争卡组构建与分析工具。从全部121张卡中选8张，查看平均圣水和平衡性，浏览高端玩家热门卡组与胜率。支持进化、英雄、冠军卡。', k: '皇室战争,卡组,最强卡组,卡组构建,Meta,胜率,进化,冠军' },
    ar: { t: 'منشئ ومحلّل مجموعات كلاش رويال | CR Deck Builders', d: 'أداة مجانية لإنشاء وتحليل مجموعات كلاش رويال. اختر 8 من أصل 121 بطاقة، وتحقّق من متوسط الإكسير والتوازن، وشاهد المجموعات الشائعة ونسب الفوز لكبار اللاعبين. يدعم التطورات والأبطال.', k: 'كلاش رويال,مجموعات,أفضل المجموعات,منشئ المجموعات,ميتا,نسبة الفوز' },
    tr: { t: 'Clash Royale Deste Oluşturucu ve Analiz | CR Deck Builders', d: 'Ücretsiz Clash Royale deste oluşturucu ve analiz aracı. 121 kartın arasından 8 tanesini seç, ortalama iksir ve dengeyi gör, üst sıradaki popüler desteleri ve kazanma oranlarını incele. Evrim, Kahraman ve Şampiyon desteği.', k: 'clash royale,desteler,en iyi desteler,deste oluşturucu,meta,kazanma oranı' },
    it: { t: 'Creatore e Analizzatore di Mazzi Clash Royale | CR Deck Builders', d: 'Creatore e analizzatore di mazzi di Clash Royale gratuito. Scegli 8 delle 121 carte, controlla costo medio e bilanciamento e scopri i mazzi popolari e i winrate dei top player. Supporta Evoluzioni, Eroi e Campioni.', k: 'clash royale,mazzi,migliori mazzi,creatore di mazzi,meta,winrate,evoluzione,campione' },
    id: { t: 'Pembuat & Penganalisis Dek Clash Royale | CR Deck Builders', d: 'Pembuat dan penganalisis dek Clash Royale gratis. Pilih 8 dari 121 kartu, cek rata-rata elixir dan keseimbangan, serta lihat dek populer dan win rate pemain top. Mendukung Evolusi, Hero, dan Champion.', k: 'clash royale,dek,dek terbaik,pembuat dek,meta,win rate,evolusi,champion' },
    th: { t: 'ตัวสร้างและวิเคราะห์เด็ค Clash Royale | CR Deck Builders', d: 'เครื่องมือสร้างและวิเคราะห์เด็ค Clash Royale ฟรี เลือก 8 ใบจาก 121 ใบ ดูค่าเฉลี่ยอิลิกเซอร์และความสมดุล พร้อมเด็คยอดนิยมและอัตราชนะของผู้เล่นอันดับต้น รองรับการอัปเกรด ฮีโร่ และแชมเปี้ยน', k: 'clash royale,เด็ค,เด็คที่ดีที่สุด,สร้างเด็ค,เมต้า,อัตราชนะ' },
    vi: { t: 'Trình Tạo & Phân Tích Bộ Bài Clash Royale | CR Deck Builders', d: 'Công cụ tạo và phân tích bộ bài Clash Royale miễn phí. Chọn 8 trong 121 lá, kiểm tra elixir trung bình và độ cân bằng, xem các bộ bài phổ biến và tỉ lệ thắng của top. Hỗ trợ Tiến hóa, Anh hùng và Nhà vô địch.', k: 'clash royale,bộ bài,bộ bài mạnh nhất,tạo bộ bài,meta,tỉ lệ thắng' },
    'zh-tw': { t: '皇室戰爭牌組產生器與分析器 | CR Deck Builders', d: '免費的皇室戰爭牌組產生器與分析工具。從全部121張卡選8張，查看平均聖水與平衡度，瀏覽高端玩家熱門牌組與勝率。支援進化、英雄、冠軍卡。', k: '皇室戰爭,牌組,最強牌組,牌組產生器,Meta,勝率,進化,冠軍' },
    fa: { t: 'سازنده و تحلیل‌گر دک کلش رویال | CR Deck Builders', d: 'ابزار رایگان ساخت و تحلیل دک کلش رویال. از میان ۱۲۱ کارت ۸ کارت انتخاب کنید، میانگین اکسیر و تعادل را ببینید و دک‌های محبوب و نرخ برد بازیکنان برتر را بررسی کنید. پشتیبانی از تکامل، قهرمان و چمپیون.', k: 'کلش رویال,دک,بهترین دک,سازنده دک,متا,نرخ برد' },
    nl: { t: 'Clash Royale Deck Builder & Analyzer | CR Deck Builders', d: 'Gratis Clash Royale deck builder en analyzer. Kies 8 van de 121 kaarten, bekijk de gemiddelde elixer en balans, en zie populaire decks en winrates van topspelers. Ondersteunt Evoluties, Helden en Kampioenen.', k: 'clash royale,decks,beste decks,deck builder,meta,winrate,evolutie,kampioen' }
  },
  'decks.html': {
    en: { t: 'Clash Royale Meta Decks & Win Rates | CR Deck Builders', d: 'Today’s best Clash Royale meta decks with usage and win rates from top-ladder players. Explore popular decks, rising decks and per-card stats. Updated daily.', k: 'clash royale meta,best decks,meta decks,ladder decks,win rate,popular decks,card stats' },
    es: { t: 'Mazos Meta de Clash Royale y Winrates | CR Deck Builders', d: 'Los mejores mazos meta de Clash Royale de hoy con uso y winrate de jugadores del top. Explora mazos populares, mazos en alza y estadísticas por carta. Actualizado a diario.', k: 'clash royale meta,mejores mazos,mazos meta,winrate,mazos populares,estadísticas' },
    'pt-br': { t: 'Decks Meta de Clash Royale e Winrates | CR Deck Builders', d: 'Os melhores decks meta de Clash Royale de hoje com uso e winrate dos jogadores do topo. Veja decks populares, decks em alta e estatísticas por carta. Atualizado diariamente.', k: 'clash royale meta,melhores decks,decks meta,winrate,decks populares,estatísticas' },
    fr: { t: 'Decks Méta Clash Royale et Taux de Victoire | CR Deck Builders', d: 'Les meilleurs decks méta de Clash Royale du jour avec utilisation et taux de victoire des meilleurs joueurs. Découvrez les decks populaires, en hausse et les stats par carte. Mis à jour quotidiennement.', k: 'clash royale méta,meilleurs decks,decks méta,taux de victoire,decks populaires' },
    de: { t: 'Clash Royale Meta-Decks & Winraten | CR Deck Builders', d: 'Die besten Clash Royale Meta-Decks von heute mit Nutzung und Winrate der Top-Spieler. Entdecke beliebte Decks, aufsteigende Decks und Karten-Statistiken. Täglich aktualisiert.', k: 'clash royale meta,beste decks,meta decks,winrate,beliebte decks' },
    ru: { t: 'Мета-колоды Clash Royale и винрейты | CR Deck Builders', d: 'Лучшие мета-колоды Clash Royale на сегодня с использованием и винрейтом топовых игроков. Популярные и набирающие колоды, статистика по картам. Обновляется ежедневно.', k: 'clash royale мета,лучшие колоды,мета колоды,винрейт,популярные колоды' },
    ko: { t: '클래시 로얄 메타 덱 & 승률 | CR Deck Builders', d: '오늘의 클래시 로얄 메타 덱을 상위 랭커의 사용률·승률과 함께. 인기 덱, 떠오르는 덱, 카드별 통계까지. 매일 업데이트.', k: '클래시로얄 메타,베스트 덱,메타 덱,승률,인기 덱' },
    'zh-cn': { t: '皇室战争Meta卡组与胜率 | CR Deck Builders', d: '今日皇室战争最强Meta卡组，含高端玩家使用率与胜率。热门卡组、上升卡组、单卡数据一应俱全，每日更新。', k: '皇室战争Meta,最强卡组,Meta卡组,胜率,热门卡组' },
    ar: { t: 'مجموعات ميتا كلاش رويال ونسب الفوز | CR Deck Builders', d: 'أفضل مجموعات ميتا كلاش رويال اليوم مع نسب الاستخدام والفوز لكبار اللاعبين. مجموعات شائعة وصاعدة وإحصاءات لكل بطاقة. تُحدّث يوميًا.', k: 'ميتا كلاش رويال,أفضل المجموعات,مجموعات ميتا,نسبة الفوز' },
    tr: { t: 'Clash Royale Meta Desteleri ve Kazanma Oranları | CR Deck Builders', d: 'Bugünün en iyi Clash Royale meta desteleri; üst sıra oyuncularının kullanım ve kazanma oranlarıyla. Popüler desteler, yükselenler ve kart istatistikleri. Her gün güncellenir.', k: 'clash royale meta,en iyi desteler,meta desteleri,kazanma oranı' },
    it: { t: 'Mazzi Meta di Clash Royale e Winrate | CR Deck Builders', d: 'I migliori mazzi meta di Clash Royale di oggi con utilizzo e winrate dei top player. Mazzi popolari, in crescita e statistiche per carta. Aggiornato ogni giorno.', k: 'clash royale meta,migliori mazzi,mazzi meta,winrate,mazzi popolari' },
    id: { t: 'Dek Meta Clash Royale & Win Rate | CR Deck Builders', d: 'Dek meta Clash Royale terbaik hari ini dengan tingkat penggunaan dan win rate pemain top. Jelajahi dek populer, dek naik daun, dan statistik per kartu. Diperbarui setiap hari.', k: 'clash royale meta,dek terbaik,dek meta,win rate,dek populer' },
    th: { t: 'เด็คเมต้า Clash Royale และอัตราชนะ | CR Deck Builders', d: 'เด็คเมต้า Clash Royale ที่ดีที่สุดวันนี้ พร้อมอัตราการใช้และอัตราชนะจากผู้เล่นอันดับต้น ดูเด็คยอดนิยม เด็คมาแรง และสถิติรายการ์ด อัปเดตทุกวัน', k: 'เมต้า clash royale,เด็คที่ดีที่สุด,เด็คเมต้า,อัตราชนะ' },
    vi: { t: 'Bộ Bài Meta Clash Royale & Tỉ Lệ Thắng | CR Deck Builders', d: 'Những bộ bài meta Clash Royale tốt nhất hôm nay với tỉ lệ dùng và tỉ lệ thắng của top thủ. Khám phá bộ bài phổ biến, đang lên và thống kê từng lá. Cập nhật hằng ngày.', k: 'meta clash royale,bộ bài tốt nhất,bộ bài meta,tỉ lệ thắng' },
    'zh-tw': { t: '皇室戰爭Meta牌組與勝率 | CR Deck Builders', d: '今日皇室戰爭最強Meta牌組，含高端玩家使用率與勝率。熱門牌組、上升牌組、單卡數據一應俱全，每日更新。', k: '皇室戰爭Meta,最強牌組,Meta牌組,勝率,熱門牌組' },
    fa: { t: 'دک‌های متای کلش رویال و نرخ برد | CR Deck Builders', d: 'بهترین دک‌های متای کلش رویال امروز همراه با میزان استفاده و نرخ برد بازیکنان برتر. دک‌های محبوب و روبه‌رشد و آمار هر کارت. به‌روزرسانی روزانه.', k: 'متای کلش رویال,بهترین دک‌ها,دک متا,نرخ برد' },
    nl: { t: 'Clash Royale Meta Decks & Winrates | CR Deck Builders', d: 'De beste Clash Royale meta decks van vandaag met gebruik en winrates van topspelers. Ontdek populaire decks, stijgende decks en kaartstatistieken. Dagelijks bijgewerkt.', k: 'clash royale meta,beste decks,meta decks,winrate,populaire decks' }
  },
  'strategy.html': {
    en: { t: 'Clash Royale Deck Analyzer — Balance & Matchups | CR Deck Builders', d: 'Analyze your Clash Royale deck: elixir curve, attack and defense balance, deck capabilities and matchups versus the meta. Free instant deck check.', k: 'clash royale deck analyzer,deck check,matchups,deck stats,balance,elixir curve' },
    es: { t: 'Analizador de Mazos de Clash Royale — Equilibrio y Enfrentamientos | CR Deck Builders', d: 'Analiza tu mazo de Clash Royale: curva de elixir, equilibrio de ataque y defensa, capacidades y enfrentamientos frente a la meta. Análisis de mazo gratis e instantáneo.', k: 'analizador de mazos,clash royale,enfrentamientos,equilibrio,curva de elixir' },
    'pt-br': { t: 'Analisador de Decks de Clash Royale — Equilíbrio e Confrontos | CR Deck Builders', d: 'Analise seu deck de Clash Royale: curva de elixir, equilíbrio de ataque e defesa, capacidades e confrontos contra a meta. Análise de deck grátis e instantânea.', k: 'analisador de decks,clash royale,confrontos,equilíbrio,curva de elixir' },
    fr: { t: 'Analyseur de Deck Clash Royale — Équilibre et Matchups | CR Deck Builders', d: 'Analysez votre deck Clash Royale : courbe d’élixir, équilibre attaque/défense, capacités et matchups face à la méta. Analyse de deck gratuite et instantanée.', k: 'analyseur de deck,clash royale,matchups,équilibre,courbe d’élixir' },
    de: { t: 'Clash Royale Deck-Analyse — Balance & Matchups | CR Deck Builders', d: 'Analysiere dein Clash Royale Deck: Elixier-Kurve, Angriffs- und Verteidigungsbalance, Deck-Fähigkeiten und Matchups gegen die Meta. Kostenlose sofortige Deck-Analyse.', k: 'deck analyse,clash royale,matchups,balance,elixier-kurve' },
    ru: { t: 'Анализатор колод Clash Royale — баланс и матчапы | CR Deck Builders', d: 'Анализ вашей колоды Clash Royale: кривая эликсира, баланс атаки и защиты, возможности и матчапы против меты. Бесплатная мгновенная проверка колоды.', k: 'анализатор колод,clash royale,матчапы,баланс,статистика колоды' },
    ko: { t: '클래시 로얄 덱 분석기 — 밸런스 & 상성 | CR Deck Builders', d: '내 클래시 로얄 덱 분석: 엘릭서 커브, 공격·방어 밸런스, 덱 역량과 메타 상성까지. 무료 즉시 덱 진단.', k: '덱 분석기,클래시로얄,상성,밸런스,덱 통계' },
    'zh-cn': { t: '皇室战争卡组分析器 — 平衡与对战 | CR Deck Builders', d: '分析你的皇室战争卡组：圣水曲线、攻防平衡、卡组能力与对阵Meta的胜负关系。免费即时卡组诊断。', k: '卡组分析,皇室战争,对战,平衡,卡组数据' },
    ar: { t: 'محلّل مجموعات كلاش رويال — التوازن والمواجهات | CR Deck Builders', d: 'حلّل مجموعتك في كلاش رويال: منحنى الإكسير، توازن الهجوم والدفاع، قدرات المجموعة ومواجهاتها ضد الميتا. فحص فوري ومجاني للمجموعة.', k: 'محلل المجموعات,كلاش رويال,المواجهات,التوازن' },
    tr: { t: 'Clash Royale Deste Analizi — Denge ve Eşleşmeler | CR Deck Builders', d: 'Clash Royale destenizi analiz edin: iksir eğrisi, saldırı/savunma dengesi, deste yetenekleri ve metaya karşı eşleşmeler. Ücretsiz anında deste kontrolü.', k: 'deste analizi,clash royale,eşleşmeler,denge' },
    it: { t: 'Analizzatore di Mazzi Clash Royale — Bilanciamento e Matchup | CR Deck Builders', d: 'Analizza il tuo mazzo di Clash Royale: curva dell’elisir, equilibrio attacco/difesa, capacità del mazzo e matchup contro la meta. Analisi del mazzo gratuita e immediata.', k: 'analizzatore di mazzi,clash royale,matchup,bilanciamento' },
    id: { t: 'Penganalisis Dek Clash Royale — Keseimbangan & Matchup | CR Deck Builders', d: 'Analisis dek Clash Royale-mu: kurva elixir, keseimbangan serang/bertahan, kemampuan dek, dan matchup melawan meta. Cek dek gratis dan instan.', k: 'penganalisis dek,clash royale,matchup,keseimbangan' },
    th: { t: 'เครื่องวิเคราะห์เด็ค Clash Royale — สมดุลและการเจอกัน | CR Deck Builders', d: 'วิเคราะห์เด็ค Clash Royale ของคุณ: เส้นโค้งอิลิกเซอร์ สมดุลรุก/รับ ความสามารถของเด็ค และการเจอกับเมต้า ตรวจเด็คฟรีทันที', k: 'วิเคราะห์เด็ค,clash royale,การเจอกัน,สมดุล' },
    vi: { t: 'Phân Tích Bộ Bài Clash Royale — Cân Bằng & Đối Đầu | CR Deck Builders', d: 'Phân tích bộ bài Clash Royale của bạn: đường cong elixir, cân bằng công/thủ, năng lực bộ bài và đối đầu với meta. Kiểm tra bộ bài miễn phí, tức thì.', k: 'phân tích bộ bài,clash royale,đối đầu,cân bằng' },
    'zh-tw': { t: '皇室戰爭牌組分析器 — 平衡與對戰 | CR Deck Builders', d: '分析你的皇室戰爭牌組：聖水曲線、攻防平衡、牌組能力與對戰Meta的勝負關係。免費即時牌組診斷。', k: '牌組分析,皇室戰爭,對戰,平衡,牌組數據' },
    fa: { t: 'تحلیل‌گر دک کلش رویال — تعادل و رویارویی | CR Deck Builders', d: 'دک کلش رویال خود را تحلیل کنید: منحنی اکسیر، تعادل حمله و دفاع، توانایی‌های دک و رویارویی با متا. بررسی رایگان و فوری دک.', k: 'تحلیل دک,کلش رویال,رویارویی,تعادل' },
    nl: { t: 'Clash Royale Deck Analyzer — Balans & Matchups | CR Deck Builders', d: 'Analyseer je Clash Royale deck: elixercurve, aanvals- en verdedigingsbalans, deckcapaciteiten en matchups tegen de meta. Gratis directe deckcheck.', k: 'deck analyzer,clash royale,matchups,balans,deckstatistieken' }
  }
};

function pageUrl(lang, page) {
  const prefix = lang === 'ja' ? '' : '/' + lang;
  const file = page === 'index.html' ? '/' : '/' + page;
  return BASE + prefix + file;
}
function hreflangBlock(page) {
  let s = '<!--HREFLANG-->\n';
  ALL.forEach(l => { s += '<link rel="alternate" hreflang="' + HREFLANG[l] + '" href="' + pageUrl(l, page) + '">\n'; });
  s += '<link rel="alternate" hreflang="x-default" href="' + pageUrl('ja', page) + '">\n';
  s += '<!--/HREFLANG-->';
  return s;
}
function stripHreflang(html) { return html.replace(/\s*<!--HREFLANG-->[\s\S]*?<!--\/HREFLANG-->/g, ''); }
function injectHreflang(html, page) {
  html = stripHreflang(html);
  return html.replace(/<\/head>/i, hreflangBlock(page) + '\n</head>');
}
function setTitle(html, v) { return html.replace(/<title>[\s\S]*?<\/title>/i, () => '<title>' + v + '</title>'); }
function setMeta(html, key, v) {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('(<meta\\s+(?:name|property)="' + esc + '"\\s+content=")[^"]*(")', 'i');
  return html.replace(re, (m, a, b) => a + v + b);
}
function setCanonical(html, url) { return html.replace(/(<link rel="canonical" href=")[^"]*(">)/i, (m, a, b) => a + url + b); }
function absolutizeAssets(html) {
  return html
    .replace(/(href|src)="css\//g, '$1="/css/')
    .replace(/(href|src)="js\//g, '$1="/js/')
    .replace(/src="(auth\.js|i18n\.js|firebase-config\.js)/g, 'src="/$1');
}

// ── GA4（Google アナリティクス）。全ページ(root+lang)の <head> 直後に注入。冪等＝既にあれば入れない。
const GA_ID = 'G-N19CVY3C3K';
const GA_SNIPPET = '<!-- Google Analytics (GA4) -->\n'
  + '<script async src="https://www.googletagmanager.com/gtag/js?id=' + GA_ID + '"></script>\n'
  + '<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}'
  + 'gtag(\'js\',new Date());gtag(\'config\',\'' + GA_ID + '\');</script>';
function injectGA(html) {
  if (html.indexOf(GA_ID) !== -1) return html;
  return html.replace(/<head>/i, '<head>\n' + GA_SNIPPET);
}

// ── Google AdSense。全ページの <head> 直後に注入。冪等＝既にあれば入れない。サイト審査もこのコードで通る（広告は ins タグを置くまで出ない）。
const ADSENSE_CLIENT = 'ca-pub-4930535711396745';
const ADSENSE_SNIPPET = '<!-- Google AdSense -->\n'
  + '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + ADSENSE_CLIENT + '" crossorigin="anonymous"></script>';
function injectAdSense(html) {
  if (html.indexOf(ADSENSE_CLIENT) !== -1) return html;
  return html.replace(/<head>/i, '<head>\n' + ADSENSE_SNIPPET);
}

// ── ライト/ダークテーマ。全ページの <head> 先頭に「localStorage→html.light適用script（描画前＝チラつき無し）」＋「html.light上書きstyle」を注入。
//    既定=ダーク。ユーザーがアカウントメニューで切替えた時だけ light。index.css/decks.css/各インラインstyleの :root を specificity で上書き＝全ページ一貫。
const THEME_BLOCK = '<script>(function(){try{if(localStorage.getItem(\'cr_theme\')===\'light\')document.documentElement.classList.add(\'light\');}catch(e){}})();</script>\n'
  + '<style>html.light{--bg:#f4f5f7;--surface:#ffffff;--surface2:#eef1f5;--border:rgba(0,0,0,.10);--border-hi:rgba(0,0,0,.22);--text:#1a1d24;--text-muted:#5c6270;--text-dim:#aeb4c0;--accent:#d6900f;--accent2:#b67a12;--red:#d83a3a;--evo:#7c4dff;--hero:#d6900f;--dim:#5c6270;--gold:#b67a12}</style>';
function injectTheme(html) {
  if (html.indexOf('cr_theme') !== -1) return html;
  return html.replace(/<head>/i, '<head>\n' + THEME_BLOCK);
}

// ── ページ遷移スライド（View Transitions API・MPA）。index↔strategy のみ方向付きスライド（モバイル）。他の遷移は無効化。非対応ブラウザは通常遷移。
const VT_BLOCK = '<!-- CRVT -->'
  + '<style>@view-transition{navigation:auto}@keyframes cr-ol{to{transform:translateX(-26%);opacity:.5}}@keyframes cr-ir{from{transform:translateX(100%)}}@keyframes cr-or{to{transform:translateX(26%);opacity:.5}}@keyframes cr-il{from{transform:translateX(-100%)}}@media(max-width:768px){html:active-view-transition-type(crf)::view-transition-old(root){animation:cr-ol .26s ease both}html:active-view-transition-type(crf)::view-transition-new(root){animation:cr-ir .26s ease both}html:active-view-transition-type(crb)::view-transition-old(root){animation:cr-or .26s ease both}html:active-view-transition-type(crb)::view-transition-new(root){animation:cr-il .26s ease both}}</style>'
  + '<script>(function(){if(!("startViewTransition"in document)||!window.navigation)return;function ty(a){try{if(!a||!a.from)return null;var f=new URL(a.from.url).pathname,o=new URL(a.entry.url).pathname;var S=function(p){return p.indexOf("strategy.html")>-1};var I=function(p){return p.charAt(p.length-1)==="/"||p.indexOf("index.html")>-1};if(I(f)&&S(o))return"crf";if(S(f)&&I(o))return"crb"}catch(e){}return null}addEventListener("pageswap",function(e){if(e.viewTransition){var t=ty(e.activation);if(t)e.viewTransition.types.add(t);else e.viewTransition.skipTransition()}});addEventListener("pagereveal",function(e){if(e.viewTransition){var t=ty(navigation.activation);if(t)e.viewTransition.types.add(t);else e.viewTransition.skipTransition()}})})();</script>';
function injectVT(html) {
  if (html.indexOf('CRVT') !== -1) return html;
  return html.replace(/<\/head>/i, VT_BLOCK + '\n</head>');
}

// ── 固定（ピン）解除トグル（2026-06-24・全固定対応に拡張）。全ページの <head> に注入（冪等）。
//    ピンON（既定）=従来どおり固定。ピンOFF(html.nopin)=そのページの固定を「全部」解除して自然スクロール：
//      ①position:sticky 全部（上部バー/メタマップ/調整タブのデッキ等。動的描画も MutationObserver で捕捉＝今後の新stickyも自動）
//      ②index ビルダーの「ビューポート高ロック＋内側スクロール枠」(body fixed / .app height / .left/.right/.card-list/.deck-slots overflow) を流し込みへ変換
//    ※position:fixed のモーダル/トースト/ポップは解除しない（sticky のみ対象＝オーバーレイは壊さない）。
const UNPIN_BLOCK = '<!-- CRPIN -->\n'
  + '<script>(function(){try{if(localStorage.getItem(\'cr_pin\')===\'off\')document.documentElement.classList.add(\'nopin\');}catch(e){}})();</script>\n'
  + '<style>'
  + 'html.nopin .sitebar,html.nopin header,html.nopin .cr-sticky{position:static!important}'
  + 'html.nopin{height:auto!important;overflow:visible!important}'
  + 'html.nopin body{position:static!important;inset:auto!important;height:auto!important;min-height:100vh;overflow:visible!important;overflow-y:visible!important;display:block!important}'
  + 'html.nopin .app{display:block!important;flex:none!important;height:auto!important;min-height:0!important;overflow:visible!important}'
  + 'html.nopin .left,html.nopin .right{flex:none!important;height:auto!important;max-height:none!important;overflow:visible!important;touch-action:auto!important}'
  + 'html.nopin .card-list,html.nopin .deck-slots{overflow:visible!important;height:auto!important;max-height:none!important;flex:none!important}'
  + '@media (max-width:720px){'
  + 'html.nopin body{position:fixed!important;inset:0!important;height:100dvh!important;min-height:0!important;display:flex!important;flex-direction:column!important;overflow:hidden!important}'
  + 'html.nopin .app{display:flex!important;flex-direction:column!important;flex:1 1 auto!important;height:auto!important;min-height:0!important;overflow:hidden!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important}'
  + 'html.nopin .right{flex:0 0 auto!important;overflow:visible!important;touch-action:auto!important}'
  + 'html.nopin .left{flex:0 0 auto!important;height:auto!important;overflow:visible!important}'
  + 'html.nopin .card-list,html.nopin .deck-slots{overflow:visible!important;height:auto!important;max-height:none!important;flex:none!important}'
  + '}'
  + '.bar-pin-btn{cursor:pointer}.bar-pin-btn.off{opacity:.5}'
  + '</style>\n'
  + '<script>document.addEventListener(\'DOMContentLoaded\',function(){'
  + 'var ja=(document.documentElement.lang||\'ja\').slice(0,2)===\'ja\';'
  + 'var P=\'<span class="nav-emoji"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.8a2 2 0 0 0-1.1-1.8l-1.8-.9A2 2 0 0 1 15 10.8V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg></span>\';'
  + 'function releaseSticky(){try{var els=document.body.getElementsByTagName(\'*\');for(var k=0;k<els.length;k++){var el=els[k];if(el.classList.contains(\'cr-sticky\'))continue;if(getComputedStyle(el).position===\'sticky\')el.classList.add(\'cr-sticky\');}}catch(e){}}'
  + 'var rows=document.querySelectorAll(\'.nav-icons\');'
  + 'for(var i=0;i<rows.length;i++){(function(row){'
  + 'if(row.querySelector(\'.bar-pin-btn\'))return;'
  + 'var b=document.createElement(\'button\');b.type=\'button\';b.className=\'nav-icon bar-pin-btn\';b.innerHTML=P;'
  + 'function paint(){var off=document.documentElement.classList.contains(\'nopin\');b.classList.toggle(\'off\',off);b.title=off?(ja?\'固定する\':\'Pin layout\'):(ja?\'固定を解除\':\'Unpin layout\');b.setAttribute(\'aria-pressed\',off?\'false\':\'true\');}'
  + 'b.addEventListener(\'click\',function(){var off=!document.documentElement.classList.contains(\'nopin\');document.documentElement.classList.toggle(\'nopin\',off);try{localStorage.setItem(\'cr_pin\',off?\'off\':\'on\');}catch(e){}if(off)releaseSticky();paint();});'
  + 'paint();row.insertBefore(b,row.firstChild);'
  + '})(rows[i]);}'
  + 'releaseSticky();'
  + 'var t;var mo=new MutationObserver(function(){if(!document.documentElement.classList.contains(\'nopin\'))return;clearTimeout(t);t=setTimeout(releaseSticky,300);});'
  + 'try{mo.observe(document.body,{childList:true,subtree:true});}catch(e){}'
  + '});</script>\n<!-- /CRPIN -->';
function injectUnpin(html) {
  // 旧 CRPIN ブロックを全除去してから新ブロックを注入（内容更新に対応・冪等）。
  // ①閉じマーカー付き（新形式）を除去 ②旧・閉じマーカー無し（comment+script+style+script）も一掃。①→②の順（②が新形式の前半を誤食しないため）。
  html = html.replace(/\s*<!-- CRPIN -->[\s\S]*?<!-- \/CRPIN -->/gi, '');
  html = html.replace(/\s*<!-- CRPIN -->[\s\S]*?<\/script>\s*<style>[\s\S]*?<\/style>\s*<script>[\s\S]*?<\/script>/gi, '');
  return html.replace(/<\/head>/i, UNPIN_BLOCK + '\n</head>');
}

function buildLangPage(srcHtml, lang, page) {
  const seo = (SEO[page] && SEO[page][lang]) || null;
  let h = stripHreflang(srcHtml);
  h = h.replace(/<html lang="ja">/, '<html lang="' + HTMLLANG[lang] + '">');
  h = absolutizeAssets(h);
  const url = pageUrl(lang, page);
  if (seo) {
    h = setTitle(h, seo.t);
    h = setMeta(h, 'description', seo.d);
    h = setMeta(h, 'keywords', seo.k);
    h = setMeta(h, 'og:title', seo.t);
    h = setMeta(h, 'og:description', seo.d);
    h = setMeta(h, 'twitter:title', seo.t);
    h = setMeta(h, 'twitter:description', seo.d);
  }
  h = setMeta(h, 'og:locale', LOCALE[lang]);
  h = setMeta(h, 'og:url', url);
  h = setCanonical(h, url);
  h = h.replace(/<\/head>/i, hreflangBlock(page) + '\n</head>');
  h = injectUnpin(injectVT(injectTheme(injectGA(injectAdSense(h)))));
  return h;
}

function writeSitemap() {
  let out = '<?xml version="1.0" encoding="UTF-8"?>\n';
  out += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n';
  const cf = { 'index.html': 'weekly', 'decks.html': 'daily', 'strategy.html': 'monthly' };
  const pr = { 'index.html': '1.0', 'decks.html': '0.9', 'strategy.html': '0.7' };
  GEN.forEach(page => {
    ALL.forEach(lang => {
      out += '  <url>\n    <loc>' + pageUrl(lang, page) + '</loc>\n';
      ALL.forEach(l => { out += '    <xhtml:link rel="alternate" hreflang="' + HREFLANG[l] + '" href="' + pageUrl(l, page) + '"/>\n'; });
      out += '    <xhtml:link rel="alternate" hreflang="x-default" href="' + pageUrl('ja', page) + '"/>\n';
      out += '    <lastmod>' + TODAY + '</lastmod>\n    <changefreq>' + (cf[page] || 'monthly') + '</changefreq>\n    <priority>' + (pr[page] || '0.4') + '</priority>\n  </url>\n';
    });
  });
  out += '</urlset>\n';
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), out);
}

function main() {
  const src = {};
  GEN.forEach(p => { src[p] = fs.readFileSync(path.join(ROOT, p), 'utf8'); });
  let n = 0;
  TARGETS.forEach(lang => {
    const dir = path.join(ROOT, lang);
    fs.mkdirSync(dir, { recursive: true });
    GEN.forEach(p => { fs.writeFileSync(path.join(dir, p), buildLangPage(src[p], lang, p)); n++; });
  });
  GEN.forEach(p => { fs.writeFileSync(path.join(ROOT, p), injectUnpin(injectVT(injectTheme(injectGA(injectAdSense(injectHreflang(src[p], p))))))); });
  writeSitemap();
  console.log('generated ' + n + ' lang pages (' + GEN.join(',') + ') for [' + TARGETS.join(', ') + '] + hreflang + sitemap');
}
main();
