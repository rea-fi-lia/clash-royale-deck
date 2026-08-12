#!/usr/bin/env node
/*
 * 海外SEO用：言語別の静的ページを生成する（依存ゼロ・純Node）。
 *  - 各言語フォルダ /<lang>/ に index/decks/strategy などを出力
 *  - 各ページに その言語の <title>/<meta>/og:locale、<html lang>、hreflang一式、自己canonical
 *  - css/js 等の相対アセットはルート絶対(/css /js)へ書換（サブフォルダでも壊れない）
 *  - ルート(ja)ページにも hreflang を注入、sitemap.xml を全URL+alternateで再生成
 *  本文の翻訳は i18n.js がクライアント側で行う（パス /<lang>/ を検出して自動描画）。
 *  使い方： node tools/gen-i18n.js
 *  ※ 文字列内のアポストロフィは ’(U+2019) を使う（JSのシングルクォートを壊さないため）。
 */
const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const BASE = 'https://crdeckbuilders.com';

const TARGETS = ['en', 'es', 'pt-br', 'fr', 'de', 'ru', 'ko', 'zh-cn', 'ar', 'tr', 'it', 'id', 'th', 'vi', 'zh-tw', 'fa', 'nl'];
const ALL = ['ja'].concat(TARGETS);
// AdSense審査中は、日本語ページだけをindex/広告対象にする。
// 18言語広告化へ戻すときは REVIEW_MODE を false にし、各言語本文を厚くしてから再生成する。
const REVIEW_MODE = true;
const INDEX_LANGS = REVIEW_MODE ? ['ja'] : ALL;
const HTMLLANG = { ja: 'ja', en: 'en', es: 'es', 'pt-br': 'pt-BR', fr: 'fr', de: 'de', ru: 'ru', ko: 'ko', 'zh-cn': 'zh-CN', ar: 'ar', tr: 'tr', it: 'it', id: 'id', th: 'th', vi: 'vi', 'zh-tw': 'zh-TW', fa: 'fa', nl: 'nl' };
const HREFLANG = HTMLLANG;
const LOCALE = { ja: 'ja_JP', en: 'en_US', es: 'es_ES', 'pt-br': 'pt_BR', fr: 'fr_FR', de: 'de_DE', ru: 'ru_RU', ko: 'ko_KR', 'zh-cn': 'zh_CN', ar: 'ar_AR', tr: 'tr_TR', it: 'it_IT', id: 'id_ID', th: 'th_TH', vi: 'vi_VN', 'zh-tw': 'zh_TW', fa: 'fa_IR', nl: 'nl_NL' };
const PAGES = ['index.html', 'decks.html', 'strategy.html', 'guide.html', 'about.html', 'faq.html', 'glossary.html'];
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
  },
  /* ── 2026-08-11 追加：コンテンツ4ページ＋UTIL3ページの言語別SEO文字列。
   *    これまで index/decks/strategy のみで、残り7ページ×17言語＝119ページが
   *    日本語title/descのまま生成されていた（AdSense後の開放時に全部SERPへ出る）。 */
  'guide.html': {
    en: { t: 'How to Build a Clash Royale Deck — Full Guide | CR Deck Builders', d: 'Learn how to build a winning Clash Royale deck: win conditions, two-card synergies, third-card picks, counters to hard matchups, average elixir, spells and buildings — the full 8-card framework.', k: 'clash royale,deck guide,how to build a deck,win condition,synergy,deck building' },
    es: { t: 'Cómo Crear un Mazo de Clash Royale — Guía Completa | CR Deck Builders', d: 'Aprende a crear un mazo ganador de Clash Royale: condición de victoria, sinergias de dos cartas, tercera carta, respuestas a rivales difíciles, coste medio, hechizos y edificios.', k: 'clash royale,guía de mazos,cómo hacer un mazo,condición de victoria,sinergia' },
    'pt-br': { t: 'Como Montar um Deck de Clash Royale — Guia Completo | CR Deck Builders', d: 'Aprenda a montar um deck vencedor de Clash Royale: condição de vitória, sinergias de duas cartas, terceira carta, respostas a confrontos difíceis, custo médio, feitiços e construções.', k: 'clash royale,guia de decks,como montar deck,condição de vitória,sinergia' },
    fr: { t: 'Comment Créer un Deck Clash Royale — Guide Complet | CR Deck Builders', d: 'Apprenez à créer un deck gagnant : condition de victoire, synergies à deux cartes, troisième carte, réponses aux matchups difficiles, coût moyen en élixir, sorts et bâtiments.', k: 'clash royale,guide deck,créer un deck,condition de victoire,synergie' },
    de: { t: 'Clash Royale Deck bauen — Kompletter Guide | CR Deck Builders', d: 'Lerne, ein starkes Clash Royale Deck zu bauen: Win-Condition, Zwei-Karten-Synergien, dritte Karte, Antworten auf schwere Matchups, Durchschnittskosten, Zauber und Gebäude.', k: 'clash royale,deck guide,deck bauen,win condition,synergie' },
    ru: { t: 'Как собрать колоду Clash Royale — полный гайд | CR Deck Builders', d: 'Учимся собирать выигрышную колоду: вин-кондишен, синергии двух карт, третья карта, ответы на сложные матчапы, средний эликсир, заклинания и здания — весь каркас из 8 карт.', k: 'clash royale,гайд по колодам,как собрать колоду,вин кондишен,синергия' },
    ko: { t: '클래시 로얄 덱 만드는 법 — 완전 가이드 | CR Deck Builders', d: '이기는 덱을 만드는 법: 승리 플랜, 2카드 시너지, 세 번째 카드, 어려운 상성 대응, 평균 엘릭서, 마법과 건물까지 — 8장 구성의 모든 것.', k: '클래시로얄,덱 가이드,덱 만들기,승리 플랜,시너지' },
    'zh-cn': { t: '皇室战争卡组构筑指南 | CR Deck Builders', d: '学习构筑制胜卡组：核心胜利手段、双卡联动、第三张卡的选择、克制困难对局、平均圣水、法术与建筑——完整的8卡构筑思路。', k: '皇室战争,卡组指南,组卡,胜利手段,联动' },
    ar: { t: 'دليل بناء مجموعة كلاش رويال | CR Deck Builders', d: 'تعلّم بناء مجموعة رابحة: خطة الفوز، توافق البطاقات، البطاقة الثالثة، الرد على المواجهات الصعبة، متوسط الإكسير، التعاويذ والمباني — إطار كامل لثماني بطاقات.', k: 'كلاش رويال,دليل المجموعات,بناء مجموعة,خطة الفوز' },
    tr: { t: 'Clash Royale Deste Kurma Rehberi | CR Deck Builders', d: 'Kazandıran deste kurmayı öğren: kazanma koşulu, ikili kart sinerjileri, üçüncü kart seçimi, zor eşleşmelere cevaplar, ortalama iksir, büyüler ve binalar — 8 kartlık tam çerçeve.', k: 'clash royale,deste rehberi,deste kurma,kazanma koşulu,sinerji' },
    it: { t: 'Come Creare un Mazzo di Clash Royale — Guida Completa | CR Deck Builders', d: 'Impara a creare un mazzo vincente: win condition, sinergie a due carte, terza carta, risposte ai matchup difficili, costo medio di elisir, incantesimi ed edifici.', k: 'clash royale,guida mazzi,creare un mazzo,win condition,sinergia' },
    id: { t: 'Cara Membuat Dek Clash Royale — Panduan Lengkap | CR Deck Builders', d: 'Pelajari cara membuat dek yang menang: win condition, sinergi dua kartu, kartu ketiga, jawaban untuk lawan sulit, rata-rata elixir, spell dan bangunan — kerangka lengkap 8 kartu.', k: 'clash royale,panduan dek,membuat dek,win condition,sinergi' },
    th: { t: 'วิธีจัดเด็ค Clash Royale — คู่มือฉบับเต็ม | CR Deck Builders', d: 'เรียนรู้การจัดเด็คให้ชนะ: เงื่อนไขชัยชนะ ซินเนอร์จี้สองใบ การ์ดใบที่สาม วิธีรับมือแมตช์ยาก ค่าเฉลี่ยอิลิกเซอร์ เวทและสิ่งก่อสร้าง', k: 'clash royale,คู่มือเด็ค,จัดเด็ค,เงื่อนไขชัยชนะ' },
    vi: { t: 'Cách Xây Bộ Bài Clash Royale — Hướng Dẫn Đầy Đủ | CR Deck Builders', d: 'Học cách xây bộ bài chiến thắng: win condition, cộng hưởng hai lá, lá thứ ba, cách xử lý kèo khó, elixir trung bình, phép và công trình — khung 8 lá hoàn chỉnh.', k: 'clash royale,hướng dẫn bộ bài,xây bộ bài,win condition' },
    'zh-tw': { t: '皇室戰爭牌組構築指南 | CR Deck Builders', d: '學習構築致勝牌組：核心勝利手段、雙卡連動、第三張卡的選擇、克制困難對局、平均聖水、法術與建築——完整的8卡構築思路。', k: '皇室戰爭,牌組指南,組牌,勝利手段,連動' },
    fa: { t: 'راهنمای ساخت دک کلش رویال | CR Deck Builders', d: 'ساخت دک برنده را یاد بگیرید: شرط برد، هم‌افزایی دو کارت، کارت سوم، پاسخ به مچ‌آپ‌های سخت، میانگین اکسیر، طلسم‌ها و ساختمان‌ها — چارچوب کامل هشت کارت.', k: 'کلش رویال,راهنمای دک,ساخت دک,شرط برد' },
    nl: { t: 'Een Clash Royale Deck Bouwen — Complete Gids | CR Deck Builders', d: 'Leer een winnend deck bouwen: win condition, synergie tussen twee kaarten, derde kaart, antwoorden op lastige matchups, gemiddelde elixer, spells en gebouwen — het volledige 8-kaartenkader.', k: 'clash royale,deck gids,deck bouwen,win condition,synergie' }
  },
  'about.html': {
    en: { t: 'About CR Deck Builders | Clash Royale Deck Tools', d: 'CR Deck Builders is a free unofficial fan tool for building, checking and exploring Clash Royale decks, powered by hourly top-ladder data. Learn how the site works and how it is made.', k: 'cr deck builders,about,clash royale tools,fan site' },
    es: { t: 'Acerca de CR Deck Builders | Herramientas de Mazos', d: 'CR Deck Builders es una herramienta fan no oficial y gratuita para crear, analizar y explorar mazos de Clash Royale con datos del top mundial actualizados cada hora. Conoce el proyecto.', k: 'cr deck builders,acerca de,herramientas clash royale' },
    'pt-br': { t: 'Sobre o CR Deck Builders | Ferramentas de Decks', d: 'O CR Deck Builders é uma ferramenta de fã, gratuita e não oficial, para montar, analisar e explorar decks de Clash Royale com dados do topo mundial atualizados a cada hora. Conheça o projeto.', k: 'cr deck builders,sobre,ferramentas clash royale' },
    fr: { t: 'À Propos de CR Deck Builders | Outils de Decks', d: 'CR Deck Builders est un outil de fan non officiel et gratuit pour créer, analyser et explorer des decks Clash Royale, avec des données du top mondial mises à jour chaque heure.', k: 'cr deck builders,à propos,outils clash royale' },
    de: { t: 'Über CR Deck Builders | Clash Royale Deck-Tools', d: 'CR Deck Builders ist ein kostenloses, inoffizielles Fan-Tool zum Bauen, Prüfen und Erkunden von Clash Royale Decks — mit stündlich aktualisierten Daten der Weltspitze. Mehr über das Projekt.', k: 'cr deck builders,über uns,clash royale tools' },
    ru: { t: 'О сайте CR Deck Builders | Инструменты для колод', d: 'CR Deck Builders — бесплатный неофициальный фан-инструмент для сборки, проверки и изучения колод Clash Royale с ежечасно обновляемыми данными топ-игроков. Узнайте о проекте.', k: 'cr deck builders,о сайте,инструменты clash royale' },
    ko: { t: 'CR Deck Builders 소개 | 클래시 로얄 덱 도구', d: 'CR Deck Builders는 매시간 갱신되는 상위 랭커 데이터로 덱을 만들고 진단하고 탐색하는 무료 비공식 팬 도구입니다. 사이트의 목적과 만든 방식을 소개합니다.', k: 'cr deck builders,소개,클래시로얄 도구' },
    'zh-cn': { t: '关于 CR Deck Builders | 皇室战争卡组工具', d: 'CR Deck Builders 是免费的非官方粉丝工具，基于每小时更新的高端玩家数据，构建、诊断并浏览皇室战争卡组。了解本站的开发方针。', k: 'cr deck builders,关于,皇室战争工具' },
    ar: { t: 'حول CR Deck Builders | أدوات مجموعات كلاش رويال', d: 'CR Deck Builders أداة مجانية غير رسمية من المعجبين لبناء مجموعات كلاش رويال وتحليلها واستكشافها، ببيانات كبار اللاعبين المحدّثة كل ساعة. تعرّف على المشروع.', k: 'cr deck builders,حول,أدوات كلاش رويال' },
    tr: { t: 'CR Deck Builders Hakkında | Deste Araçları', d: 'CR Deck Builders; saatlik güncellenen üst sıra verileriyle Clash Royale destesi kurmak, kontrol etmek ve keşfetmek için ücretsiz, resmi olmayan bir hayran aracıdır. Projeyi tanıyın.', k: 'cr deck builders,hakkında,clash royale araçları' },
    it: { t: 'Chi Siamo — CR Deck Builders | Strumenti per Mazzi', d: 'CR Deck Builders è uno strumento fan gratuito e non ufficiale per creare, analizzare ed esplorare mazzi di Clash Royale, con dati dei top player aggiornati ogni ora. Scopri il progetto.', k: 'cr deck builders,chi siamo,strumenti clash royale' },
    id: { t: 'Tentang CR Deck Builders | Alat Dek Clash Royale', d: 'CR Deck Builders adalah alat fan tidak resmi dan gratis untuk membuat, memeriksa, dan menjelajahi dek Clash Royale dengan data pemain top yang diperbarui setiap jam. Kenali proyek ini.', k: 'cr deck builders,tentang,alat clash royale' },
    th: { t: 'เกี่ยวกับ CR Deck Builders | เครื่องมือเด็ค', d: 'CR Deck Builders คือเครื่องมือแฟนเมดฟรีที่ไม่เป็นทางการ สำหรับสร้าง วิเคราะห์ และสำรวจเด็ค Clash Royale ด้วยข้อมูลผู้เล่นอันดับต้นที่อัปเดตทุกชั่วโมง', k: 'cr deck builders,เกี่ยวกับ,เครื่องมือ clash royale' },
    vi: { t: 'Về CR Deck Builders | Công Cụ Bộ Bài Clash Royale', d: 'CR Deck Builders là công cụ fan không chính thức, miễn phí để xây, kiểm tra và khám phá bộ bài Clash Royale với dữ liệu top thủ cập nhật mỗi giờ. Tìm hiểu về dự án.', k: 'cr deck builders,giới thiệu,công cụ clash royale' },
    'zh-tw': { t: '關於 CR Deck Builders | 皇室戰爭牌組工具', d: 'CR Deck Builders 是免費的非官方粉絲工具，基於每小時更新的高端玩家數據，構築、診斷並瀏覽皇室戰爭牌組。了解本站的開發方針。', k: 'cr deck builders,關於,皇室戰爭工具' },
    fa: { t: 'درباره CR Deck Builders | ابزار دک کلش رویال', d: 'CR Deck Builders ابزاری رایگان و غیررسمی از طرفداران برای ساخت، بررسی و کاوش دک‌های کلش رویال با داده‌های بازیکنان برتر است که هر ساعت به‌روزرسانی می‌شود.', k: 'cr deck builders,درباره,ابزار کلش رویال' },
    nl: { t: 'Over CR Deck Builders | Clash Royale Deck-Tools', d: 'CR Deck Builders is een gratis, onofficiële fantool om Clash Royale decks te bouwen, te checken en te verkennen, met elk uur bijgewerkte data van topspelers. Lees meer over het project.', k: 'cr deck builders,over,clash royale tools' }
  },
  'faq.html': {
    en: { t: 'FAQ — Clash Royale Deck Builder | CR Deck Builders', d: 'Frequently asked questions about CR Deck Builders: how to build decks, use the assist, read popular-deck stats, copy decks to the game, data sources and privacy.', k: 'faq,clash royale,deck builder,questions' },
    es: { t: 'Preguntas Frecuentes | CR Deck Builders', d: 'Preguntas frecuentes sobre CR Deck Builders: cómo crear mazos, usar el asistente, leer estadísticas de mazos populares, copiar mazos al juego, fuentes de datos y privacidad.', k: 'faq,preguntas,clash royale,mazos' },
    'pt-br': { t: 'Perguntas Frequentes | CR Deck Builders', d: 'Perguntas frequentes sobre o CR Deck Builders: como montar decks, usar o assistente, ler estatísticas de decks populares, copiar decks para o jogo, fontes de dados e privacidade.', k: 'faq,perguntas,clash royale,decks' },
    fr: { t: 'FAQ — Questions Fréquentes | CR Deck Builders', d: 'Questions fréquentes sur CR Deck Builders : créer des decks, utiliser l’assistant, lire les stats des decks populaires, copier un deck dans le jeu, sources de données et confidentialité.', k: 'faq,questions,clash royale,decks' },
    de: { t: 'FAQ — Häufige Fragen | CR Deck Builders', d: 'Häufige Fragen zu CR Deck Builders: Decks bauen, den Assistenten nutzen, Statistiken beliebter Decks lesen, Decks ins Spiel kopieren, Datenquellen und Datenschutz.', k: 'faq,fragen,clash royale,decks' },
    ru: { t: 'FAQ — частые вопросы | CR Deck Builders', d: 'Частые вопросы о CR Deck Builders: как собирать колоды, пользоваться ассистентом, читать статистику популярных колод, копировать колоды в игру, источники данных и приватность.', k: 'faq,вопросы,clash royale,колоды' },
    ko: { t: '자주 묻는 질문 | CR Deck Builders', d: 'CR Deck Builders에 대한 자주 묻는 질문: 덱 만드는 법, 어시스트 사용법, 인기 덱 통계 보는 법, 게임으로 덱 복사, 데이터 출처와 개인정보.', k: 'faq,질문,클래시로얄,덱' },
    'zh-cn': { t: '常见问题 | CR Deck Builders', d: '关于 CR Deck Builders 的常见问题：如何组卡、如何使用助手、如何看热门卡组数据、如何把卡组复制进游戏、数据来源与隐私。', k: '常见问题,faq,皇室战争,卡组' },
    ar: { t: 'الأسئلة الشائعة | CR Deck Builders', d: 'الأسئلة الشائعة حول CR Deck Builders: بناء المجموعات، استخدام المساعد، قراءة إحصاءات المجموعات الشائعة، نسخ المجموعة إلى اللعبة، مصادر البيانات والخصوصية.', k: 'أسئلة شائعة,كلاش رويال,مجموعات' },
    tr: { t: 'SSS — Sık Sorulan Sorular | CR Deck Builders', d: 'CR Deck Builders hakkında sık sorulan sorular: deste kurma, asistanı kullanma, popüler deste istatistiklerini okuma, desteyi oyuna kopyalama, veri kaynakları ve gizlilik.', k: 'sss,sorular,clash royale,deste' },
    it: { t: 'FAQ — Domande Frequenti | CR Deck Builders', d: 'Domande frequenti su CR Deck Builders: creare mazzi, usare l’assistente, leggere le statistiche dei mazzi popolari, copiare i mazzi nel gioco, fonti dei dati e privacy.', k: 'faq,domande,clash royale,mazzi' },
    id: { t: 'FAQ — Pertanyaan Umum | CR Deck Builders', d: 'Pertanyaan umum tentang CR Deck Builders: cara membuat dek, memakai asisten, membaca statistik dek populer, menyalin dek ke gim, sumber data, dan privasi.', k: 'faq,pertanyaan,clash royale,dek' },
    th: { t: 'คำถามที่พบบ่อย | CR Deck Builders', d: 'คำถามที่พบบ่อยเกี่ยวกับ CR Deck Builders: วิธีจัดเด็ค การใช้ตัวช่วย การอ่านสถิติเด็คยอดนิยม การคัดลอกเด็คเข้าเกม แหล่งข้อมูล และความเป็นส่วนตัว', k: 'คำถามที่พบบ่อย,clash royale,เด็ค' },
    vi: { t: 'Câu Hỏi Thường Gặp | CR Deck Builders', d: 'Câu hỏi thường gặp về CR Deck Builders: cách xây bộ bài, dùng trợ lý, đọc thống kê bộ bài phổ biến, sao chép bộ bài vào game, nguồn dữ liệu và quyền riêng tư.', k: 'faq,câu hỏi,clash royale,bộ bài' },
    'zh-tw': { t: '常見問題 | CR Deck Builders', d: '關於 CR Deck Builders 的常見問題：如何組牌、如何使用助手、如何看熱門牌組數據、如何把牌組複製進遊戲、資料來源與隱私。', k: '常見問題,faq,皇室戰爭,牌組' },
    fa: { t: 'پرسش‌های متداول | CR Deck Builders', d: 'پرسش‌های متداول درباره CR Deck Builders: ساخت دک، استفاده از دستیار، خواندن آمار دک‌های محبوب، کپی دک به بازی، منابع داده و حریم خصوصی.', k: 'پرسش‌های متداول,کلش رویال,دک' },
    nl: { t: 'FAQ — Veelgestelde Vragen | CR Deck Builders', d: 'Veelgestelde vragen over CR Deck Builders: decks bouwen, de assistent gebruiken, statistieken van populaire decks lezen, decks naar het spel kopiëren, databronnen en privacy.', k: 'faq,vragen,clash royale,decks' }
  },
  'glossary.html': {
    en: { t: 'Clash Royale Deck Glossary | CR Deck Builders', d: 'Deck-building terms explained: win condition, synergy, third-card picks, counter cards, average elixir, cycle, air defense, swarm control and more.', k: 'clash royale,glossary,terms,win condition,synergy,counter' },
    es: { t: 'Glosario de Mazos de Clash Royale | CR Deck Builders', d: 'Términos de creación de mazos explicados: condición de victoria, sinergia, tercera carta, cartas de respuesta, coste medio, ciclo, defensa aérea y control de enjambres.', k: 'clash royale,glosario,términos,condición de victoria' },
    'pt-br': { t: 'Glossário de Decks de Clash Royale | CR Deck Builders', d: 'Termos de construção de decks explicados: condição de vitória, sinergia, terceira carta, cartas de resposta, custo médio, ciclo, defesa aérea e controle de hordas.', k: 'clash royale,glossário,termos,condição de vitória' },
    fr: { t: 'Glossaire des Decks Clash Royale | CR Deck Builders', d: 'Les termes de la création de decks expliqués : condition de victoire, synergie, troisième carte, cartes de réponse, coût moyen, cycle, défense anti-air et contrôle des nuées.', k: 'clash royale,glossaire,termes,condition de victoire' },
    de: { t: 'Clash Royale Deck-Glossar | CR Deck Builders', d: 'Deckbau-Begriffe erklärt: Win-Condition, Synergie, dritte Karte, Konterkarten, Durchschnittskosten, Cycle, Luftverteidigung und Schwarmkontrolle.', k: 'clash royale,glossar,begriffe,win condition' },
    ru: { t: 'Словарь терминов колод Clash Royale | CR Deck Builders', d: 'Термины дек-билдинга: вин-кондишен, синергия, третья карта, карты-ответы, средний эликсир, цикл, ПВО и контроль толпы.', k: 'clash royale,словарь,термины,вин кондишен' },
    ko: { t: '클래시 로얄 덱 용어집 | CR Deck Builders', d: '덱 구성 용어 정리: 승리 플랜, 시너지, 세 번째 카드, 대응 카드, 평균 엘릭서, 순환, 대공, 물량 처리 등.', k: '클래시로얄,용어집,승리 플랜,시너지' },
    'zh-cn': { t: '皇室战争卡组术语表 | CR Deck Builders', d: '组卡术语解释：胜利手段、联动、第三张卡、克制卡、平均圣水、循环、对空、清群等。', k: '皇室战争,术语表,胜利手段,联动' },
    ar: { t: 'مسرد مصطلحات مجموعات كلاش رويال | CR Deck Builders', d: 'شرح مصطلحات بناء المجموعات: خطة الفوز، التوافق، البطاقة الثالثة، بطاقات الرد، متوسط الإكسير، الدورة، الدفاع الجوي والتعامل مع الحشود.', k: 'كلاش رويال,مسرد,مصطلحات' },
    tr: { t: 'Clash Royale Deste Terimleri Sözlüğü | CR Deck Builders', d: 'Deste kurma terimleri: kazanma koşulu, sinerji, üçüncü kart, cevap kartları, ortalama iksir, döngü, hava savunması ve kalabalık kontrolü.', k: 'clash royale,sözlük,terimler,kazanma koşulu' },
    it: { t: 'Glossario dei Mazzi di Clash Royale | CR Deck Builders', d: 'I termini del deck building spiegati: win condition, sinergia, terza carta, carte risposta, costo medio di elisir, ciclo, difesa aerea e controllo degli sciami.', k: 'clash royale,glossario,termini,win condition' },
    id: { t: 'Glosarium Dek Clash Royale | CR Deck Builders', d: 'Istilah pembuatan dek dijelaskan: win condition, sinergi, kartu ketiga, kartu jawaban, rata-rata elixir, siklus, pertahanan udara, dan kontrol gerombolan.', k: 'clash royale,glosarium,istilah,win condition' },
    th: { t: 'อภิธานศัพท์เด็ค Clash Royale | CR Deck Builders', d: 'อธิบายศัพท์การจัดเด็ค: เงื่อนไขชัยชนะ ซินเนอร์จี้ การ์ดใบที่สาม การ์ดรับมือ ค่าเฉลี่ยอิลิกเซอร์ วงจรหมุนเวียน การป้องกันทางอากาศ', k: 'clash royale,อภิธานศัพท์,ศัพท์' },
    vi: { t: 'Thuật Ngữ Bộ Bài Clash Royale | CR Deck Builders', d: 'Giải thích thuật ngữ xây bộ bài: win condition, cộng hưởng, lá thứ ba, lá khắc chế, elixir trung bình, chu kỳ, phòng không và xử lý bầy đàn.', k: 'clash royale,thuật ngữ,win condition' },
    'zh-tw': { t: '皇室戰爭牌組術語表 | CR Deck Builders', d: '組牌術語解釋：勝利手段、連動、第三張卡、克制卡、平均聖水、循環、對空、清群等。', k: '皇室戰爭,術語表,勝利手段,連動' },
    fa: { t: 'واژه‌نامه دک کلش رویال | CR Deck Builders', d: 'توضیح اصطلاحات ساخت دک: شرط برد، هم‌افزایی، کارت سوم، کارت‌های پاسخ، میانگین اکسیر، چرخه، پدافند هوایی و کنترل ازدحام.', k: 'کلش رویال,واژه‌نامه,اصطلاحات' },
    nl: { t: 'Clash Royale Deck-Woordenlijst | CR Deck Builders', d: 'Deckbouwtermen uitgelegd: win condition, synergie, derde kaart, counterkaarten, gemiddelde elixer, cycle, luchtverdediging en swarmcontrole.', k: 'clash royale,woordenlijst,termen,win condition' }
  },
  'support.html': {
    en: { t: 'Support & Donations | CR Deck Builders', d: 'Support the development of CR Deck Builders with a donation. Donations help cover data collection and hosting for this free Clash Royale fan tool.', k: 'support,donation,cr deck builders' },
    es: { t: 'Apoyo y Donaciones | CR Deck Builders', d: 'Apoya el desarrollo de CR Deck Builders con una donación. Las donaciones ayudan a cubrir la recopilación de datos y el alojamiento de esta herramienta fan gratuita.', k: 'apoyo,donación,cr deck builders' },
    'pt-br': { t: 'Apoio e Doações | CR Deck Builders', d: 'Apoie o desenvolvimento do CR Deck Builders com uma doação. As doações ajudam a cobrir a coleta de dados e a hospedagem desta ferramenta de fã gratuita.', k: 'apoio,doação,cr deck builders' },
    fr: { t: 'Soutien et Dons | CR Deck Builders', d: 'Soutenez le développement de CR Deck Builders par un don. Les dons couvrent la collecte de données et l’hébergement de cet outil de fan gratuit.', k: 'soutien,don,cr deck builders' },
    de: { t: 'Unterstützung & Spenden | CR Deck Builders', d: 'Unterstütze die Entwicklung von CR Deck Builders mit einer Spende. Spenden helfen, Datensammlung und Hosting dieses kostenlosen Fan-Tools zu decken.', k: 'unterstützung,spende,cr deck builders' },
    ru: { t: 'Поддержка и пожертвования | CR Deck Builders', d: 'Поддержите развитие CR Deck Builders пожертвованием. Пожертвования помогают покрывать сбор данных и хостинг этого бесплатного фан-инструмента.', k: 'поддержка,пожертвование,cr deck builders' },
    ko: { t: '후원 안내 | CR Deck Builders', d: '후원으로 CR Deck Builders의 개발을 응원해 주세요. 후원금은 이 무료 팬 도구의 데이터 수집과 호스팅 비용에 쓰입니다.', k: '후원,기부,cr deck builders' },
    'zh-cn': { t: '支持与捐助 | CR Deck Builders', d: '通过捐助支持 CR Deck Builders 的开发。捐助将用于这款免费粉丝工具的数据收集与托管费用。', k: '支持,捐助,cr deck builders' },
    ar: { t: 'الدعم والتبرعات | CR Deck Builders', d: 'ادعم تطوير CR Deck Builders بتبرع. تساعد التبرعات في تغطية تكاليف جمع البيانات والاستضافة لهذه الأداة المجانية.', k: 'دعم,تبرع,cr deck builders' },
    tr: { t: 'Destek ve Bağış | CR Deck Builders', d: 'Bir bağışla CR Deck Builders’ın geliştirilmesine destek olun. Bağışlar bu ücretsiz hayran aracının veri toplama ve barındırma maliyetlerini karşılar.', k: 'destek,bağış,cr deck builders' },
    it: { t: 'Sostegno e Donazioni | CR Deck Builders', d: 'Sostieni lo sviluppo di CR Deck Builders con una donazione. Le donazioni coprono la raccolta dati e l’hosting di questo strumento fan gratuito.', k: 'sostegno,donazione,cr deck builders' },
    id: { t: 'Dukungan & Donasi | CR Deck Builders', d: 'Dukung pengembangan CR Deck Builders dengan donasi. Donasi membantu menutup biaya pengumpulan data dan hosting alat fan gratis ini.', k: 'dukungan,donasi,cr deck builders' },
    th: { t: 'สนับสนุนและบริจาค | CR Deck Builders', d: 'สนับสนุนการพัฒนา CR Deck Builders ด้วยการบริจาค เงินบริจาคช่วยครอบคลุมค่าเก็บข้อมูลและโฮสติงของเครื่องมือแฟนเมดฟรีนี้', k: 'สนับสนุน,บริจาค,cr deck builders' },
    vi: { t: 'Ủng Hộ & Quyên Góp | CR Deck Builders', d: 'Ủng hộ việc phát triển CR Deck Builders bằng một khoản quyên góp. Quyên góp giúp trang trải chi phí thu thập dữ liệu và lưu trữ của công cụ fan miễn phí này.', k: 'ủng hộ,quyên góp,cr deck builders' },
    'zh-tw': { t: '支持與捐助 | CR Deck Builders', d: '透過捐助支持 CR Deck Builders 的開發。捐助將用於這款免費粉絲工具的資料收集與託管費用。', k: '支持,捐助,cr deck builders' },
    fa: { t: 'حمایت و کمک مالی | CR Deck Builders', d: 'با کمک مالی از توسعه CR Deck Builders حمایت کنید. کمک‌ها هزینه جمع‌آوری داده و میزبانی این ابزار رایگان را پوشش می‌دهد.', k: 'حمایت,کمک مالی,cr deck builders' },
    nl: { t: 'Steun & Donaties | CR Deck Builders', d: 'Steun de ontwikkeling van CR Deck Builders met een donatie. Donaties dekken de dataverzameling en hosting van deze gratis fantool.', k: 'steun,donatie,cr deck builders' }
  },
  'contact.html': {
    en: { t: 'Contact & Requests | CR Deck Builders', d: 'Send feature requests, card-addition requests, bug reports and questions about CR Deck Builders here.', k: 'contact,request,cr deck builders' },
    es: { t: 'Contacto y Solicitudes | CR Deck Builders', d: 'Envía aquí solicitudes de funciones, peticiones de cartas nuevas, informes de errores y preguntas sobre CR Deck Builders.', k: 'contacto,solicitud,cr deck builders' },
    'pt-br': { t: 'Contato e Solicitações | CR Deck Builders', d: 'Envie aqui pedidos de recursos, solicitações de novas cartas, relatos de bugs e dúvidas sobre o CR Deck Builders.', k: 'contato,solicitação,cr deck builders' },
    fr: { t: 'Contact et Demandes | CR Deck Builders', d: 'Envoyez ici vos demandes de fonctionnalités, d’ajout de cartes, vos signalements de bugs et vos questions sur CR Deck Builders.', k: 'contact,demande,cr deck builders' },
    de: { t: 'Kontakt & Anfragen | CR Deck Builders', d: 'Sende hier Funktionswünsche, Anfragen für neue Karten, Fehlerberichte und Fragen zu CR Deck Builders.', k: 'kontakt,anfrage,cr deck builders' },
    ru: { t: 'Контакты и запросы | CR Deck Builders', d: 'Отправляйте сюда запросы функций, просьбы о добавлении карт, сообщения об ошибках и вопросы о CR Deck Builders.', k: 'контакты,запрос,cr deck builders' },
    ko: { t: '문의 및 요청 | CR Deck Builders', d: '기능 요청, 카드 추가 요청, 버그 신고, CR Deck Builders에 대한 질문은 여기로 보내주세요.', k: '문의,요청,cr deck builders' },
    'zh-cn': { t: '联系与请求 | CR Deck Builders', d: '功能请求、新卡添加请求、错误报告以及关于 CR Deck Builders 的问题，请从这里提交。', k: '联系,请求,cr deck builders' },
    ar: { t: 'التواصل والطلبات | CR Deck Builders', d: 'أرسل من هنا طلبات الميزات وإضافة البطاقات وتقارير الأخطاء وأسئلتك حول CR Deck Builders.', k: 'تواصل,طلب,cr deck builders' },
    tr: { t: 'İletişim ve İstekler | CR Deck Builders', d: 'Özellik isteklerini, kart ekleme taleplerini, hata bildirimlerini ve CR Deck Builders hakkındaki sorularını buradan gönder.', k: 'iletişim,istek,cr deck builders' },
    it: { t: 'Contatti e Richieste | CR Deck Builders', d: 'Invia qui richieste di funzionalità, richieste di nuove carte, segnalazioni di bug e domande su CR Deck Builders.', k: 'contatti,richiesta,cr deck builders' },
    id: { t: 'Kontak & Permintaan | CR Deck Builders', d: 'Kirimkan permintaan fitur, permintaan penambahan kartu, laporan bug, dan pertanyaan tentang CR Deck Builders di sini.', k: 'kontak,permintaan,cr deck builders' },
    th: { t: 'ติดต่อและคำขอ | CR Deck Builders', d: 'ส่งคำขอฟีเจอร์ คำขอเพิ่มการ์ด รายงานบั๊ก และคำถามเกี่ยวกับ CR Deck Builders ได้ที่นี่', k: 'ติดต่อ,คำขอ,cr deck builders' },
    vi: { t: 'Liên Hệ & Yêu Cầu | CR Deck Builders', d: 'Gửi yêu cầu tính năng, yêu cầu thêm lá bài, báo lỗi và câu hỏi về CR Deck Builders tại đây.', k: 'liên hệ,yêu cầu,cr deck builders' },
    'zh-tw': { t: '聯絡與請求 | CR Deck Builders', d: '功能請求、新卡添加請求、錯誤回報以及關於 CR Deck Builders 的問題，請從這裡提交。', k: '聯絡,請求,cr deck builders' },
    fa: { t: 'تماس و درخواست‌ها | CR Deck Builders', d: 'درخواست قابلیت، درخواست افزودن کارت، گزارش اشکال و پرسش‌های خود درباره CR Deck Builders را از اینجا بفرستید.', k: 'تماس,درخواست,cr deck builders' },
    nl: { t: 'Contact & Verzoeken | CR Deck Builders', d: 'Stuur hier functieverzoeken, verzoeken om nieuwe kaarten, bugmeldingen en vragen over CR Deck Builders.', k: 'contact,verzoek,cr deck builders' }
  },
  'privacy.html': {
    en: { t: 'Privacy Policy | CR Deck Builders', d: 'Privacy policy of CR Deck Builders: what data the site uses (analytics, ads, login), how it is stored, and how to contact us.', k: 'privacy policy,cr deck builders' },
    es: { t: 'Política de Privacidad | CR Deck Builders', d: 'Política de privacidad de CR Deck Builders: qué datos usa el sitio (analítica, anuncios, inicio de sesión), cómo se almacenan y cómo contactarnos.', k: 'política de privacidad,cr deck builders' },
    'pt-br': { t: 'Política de Privacidade | CR Deck Builders', d: 'Política de privacidade do CR Deck Builders: quais dados o site usa (análise, anúncios, login), como são armazenados e como falar conosco.', k: 'política de privacidade,cr deck builders' },
    fr: { t: 'Politique de Confidentialité | CR Deck Builders', d: 'Politique de confidentialité de CR Deck Builders : quelles données le site utilise (analyse, publicités, connexion), comment elles sont stockées et comment nous contacter.', k: 'politique de confidentialité,cr deck builders' },
    de: { t: 'Datenschutzerklärung | CR Deck Builders', d: 'Datenschutzerklärung von CR Deck Builders: welche Daten die Seite nutzt (Analyse, Werbung, Login), wie sie gespeichert werden und wie du uns erreichst.', k: 'datenschutz,cr deck builders' },
    ru: { t: 'Политика конфиденциальности | CR Deck Builders', d: 'Политика конфиденциальности CR Deck Builders: какие данные использует сайт (аналитика, реклама, вход), как они хранятся и как с нами связаться.', k: 'политика конфиденциальности,cr deck builders' },
    ko: { t: '개인정보 처리방침 | CR Deck Builders', d: 'CR Deck Builders의 개인정보 처리방침: 사이트가 사용하는 데이터(분석, 광고, 로그인), 저장 방식, 문의 방법을 안내합니다.', k: '개인정보 처리방침,cr deck builders' },
    'zh-cn': { t: '隐私政策 | CR Deck Builders', d: 'CR Deck Builders 的隐私政策：本站使用哪些数据（分析、广告、登录）、如何存储以及联系方式。', k: '隐私政策,cr deck builders' },
    ar: { t: 'سياسة الخصوصية | CR Deck Builders', d: 'سياسة الخصوصية لـ CR Deck Builders: ما البيانات التي يستخدمها الموقع (التحليلات، الإعلانات، تسجيل الدخول)، وكيف تُخزَّن، وكيف تتواصل معنا.', k: 'سياسة الخصوصية,cr deck builders' },
    tr: { t: 'Gizlilik Politikası | CR Deck Builders', d: 'CR Deck Builders gizlilik politikası: sitenin kullandığı veriler (analiz, reklam, giriş), nasıl saklandığı ve bize nasıl ulaşacağın.', k: 'gizlilik politikası,cr deck builders' },
    it: { t: 'Informativa sulla Privacy | CR Deck Builders', d: 'Informativa sulla privacy di CR Deck Builders: quali dati usa il sito (analisi, annunci, accesso), come vengono conservati e come contattarci.', k: 'privacy,cr deck builders' },
    id: { t: 'Kebijakan Privasi | CR Deck Builders', d: 'Kebijakan privasi CR Deck Builders: data apa yang dipakai situs (analitik, iklan, login), cara penyimpanannya, dan cara menghubungi kami.', k: 'kebijakan privasi,cr deck builders' },
    th: { t: 'นโยบายความเป็นส่วนตัว | CR Deck Builders', d: 'นโยบายความเป็นส่วนตัวของ CR Deck Builders: เว็บไซต์ใช้ข้อมูลใดบ้าง (วิเคราะห์ โฆษณา ล็อกอิน) จัดเก็บอย่างไร และติดต่อเราได้อย่างไร', k: 'นโยบายความเป็นส่วนตัว,cr deck builders' },
    vi: { t: 'Chính Sách Bảo Mật | CR Deck Builders', d: 'Chính sách bảo mật của CR Deck Builders: trang web dùng dữ liệu gì (phân tích, quảng cáo, đăng nhập), lưu trữ ra sao và cách liên hệ.', k: 'chính sách bảo mật,cr deck builders' },
    'zh-tw': { t: '隱私權政策 | CR Deck Builders', d: 'CR Deck Builders 的隱私權政策：本站使用哪些資料（分析、廣告、登入）、如何儲存以及聯絡方式。', k: '隱私權政策,cr deck builders' },
    fa: { t: 'سیاست حریم خصوصی | CR Deck Builders', d: 'سیاست حریم خصوصی CR Deck Builders: سایت از چه داده‌هایی استفاده می‌کند (تحلیل، تبلیغات، ورود)، نحوه نگهداری و راه تماس با ما.', k: 'حریم خصوصی,cr deck builders' },
    nl: { t: 'Privacybeleid | CR Deck Builders', d: 'Privacybeleid van CR Deck Builders: welke gegevens de site gebruikt (analyse, advertenties, inloggen), hoe ze worden bewaard en hoe je ons bereikt.', k: 'privacybeleid,cr deck builders' }
  }
};

function pageUrl(lang, page) {
  const prefix = lang === 'ja' ? '' : '/' + lang;
  const file = page === 'index.html' ? '/' : '/' + page;
  return BASE + prefix + file;
}
function hreflangBlock(page, langs = INDEX_LANGS) {
  let s = '<!--HREFLANG-->\n';
  langs.forEach(l => { s += '<link rel="alternate" hreflang="' + HREFLANG[l] + '" href="' + pageUrl(l, page) + '">\n'; });
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
function setRobots(html, v) {
  if (/<meta\s+name="robots"\s+content="[^"]*"\s*>/i.test(html)) {
    return html.replace(/(<meta\s+name="robots"\s+content=")[^"]*("\s*>)/i, (m, a, b) => a + v + b);
  }
  return html.replace(/<meta\s+name="viewport"[^>]*>/i, m => m + '\n<meta name="robots" content="' + v + '">');
}
function setCanonical(html, url) { return html.replace(/(<link rel="canonical" href=")[^"]*(">)/i, (m, a, b) => a + url + b); }
/* ルート直下の実在ディレクトリ（言語フォルダ・隠しフォルダは除く）。
 * ★以前は css/ と js/ だけを名指しで絶対パス化していたため cards/ が漏れ、
 *   17言語すべてのナビ「全カードデータ」が /<lang>/cards/index.html を指して404になっていた
 *   （2026-08-12発見。noindex,follow なのでクローラーは辿っていた）。
 *   名指しをやめ、実在ディレクトリを走査して全部絶対化する＝今後フォルダが増えても漏れない。 */
function rootDirs() {
  return fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.') &&
                 !TARGETS.includes(d.name) && d.name !== 'node_modules')
    .map(d => d.name);
}
const ROOT_DIRS = rootDirs();

function absolutizeAssets(html) {
  let s = html.replace(/src="(auth\.js|i18n\.js|firebase-config\.js)/g, 'src="/$1');
  ROOT_DIRS.forEach(d => {
    const esc = d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp('(href|src)="' + esc + '\\/', 'g'), '$1="/' + d + '/');
  });
  return s;
}

/* ── 本文の静的翻訳（2026-08-11 追加） ─────────────────────────────
 * tools/i18n-content/<lang>.json（形式: { "日本語原文(trim)": "翻訳" }）があれば、
 * 生成時にテキストノード単位で置換して「静的に翻訳済みの言語ページ」を出す。
 * 辞書に無い文はそのまま（＝日本語fallback。壊れない）。
 * 日本語ページが正本：日本語を編集→gen-i18n再実行→全言語へ構造ごと反映。
 * 新しく増えた日本語文は未訳として残り、tools/i18n-extract.js が検出する。
 * ※ランタイムの i18n.js（アプリUI辞書）とは独立。静的置換が先に効き、
 *   置換済みテキストは日本語キーに一致しないので二重翻訳は起きない。 */
const CONTENT_DIR = path.join(__dirname, 'i18n-content');
const JA_RE = /[぀-ヿ一-鿿]/;
const _contentCache = {};
const SWAP_STATS = {};   // lang → {total, done}（日本語テキストノード数と置換数）
function contentDict(lang) {
  if (lang in _contentCache) return _contentCache[lang];
  let d = null;
  try { d = JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, lang + '.json'), 'utf8')); } catch (e) {}
  _contentCache[lang] = d;
  return d;
}
function swapBodyText(html, dict, stats) {
  // script/style/コメントを退避（中の「<」で分割が壊れるのを防ぐ）→ テキストノードだけ置換 → 復元
  const vault = [];
  html = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi,
    m => { vault.push(m); return '<\u0000' + (vault.length - 1) + '>'; });   // タグ形＝split後もテキストノードへ混ざらない
  const parts = html.split(/(<[^>]+>)/);
  for (let i = 0; i < parts.length; i += 2) {          // 偶数インデックスがテキストノード
    const seg = parts[i];
    if (!seg || !JA_RE.test(seg)) continue;
    const key = seg.trim();
    if (!key) continue;
    stats.total++;
    const tr = dict[key];
    if (tr == null || tr === '') continue;
    stats.done++;
    parts[i] = seg.replace(key, () => tr);             // 関数形＝訳文中の$を安全に
  }
  html = parts.join('');
  return html.replace(/<\u0000(\d+)>/g, (m, n) => vault[+n]);
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
function stripAdSense(html) {
  return html.replace(new RegExp('\\s*<!-- Google AdSense -->\\n<script async src="https://pagead2\\.googlesyndication\\.com/pagead/js/adsbygoogle\\.js\\?client=' + ADSENSE_CLIENT + '" crossorigin="anonymous"><\\/script>', 'g'), '');
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
//      ①既知のsticky要素（.sitebar / header / .mm-sticky / 調整タブの #diagResult.tab-sim .dg-deckbar）をCSSで直接 static 化。
//         ※2026-06-26 パフォーマンス改善：旧実装の「全DOMを getComputedStyle で走査＋MutationObserver」を撤廃（強制リフローが重かった）。新stickyを足したらこの4セレクタ列に追記する運用に変更。
//      ②index ビルダーの「ビューポート高ロック＋内側スクロール枠」(body fixed / .app height / .left/.right/.card-list/.deck-slots overflow) を流し込みへ変換
//    ※position:fixed のモーダル/トースト/ポップは解除しない（sticky のみ対象＝オーバーレイは壊さない）。
const UNPIN_BLOCK = '<!-- CRPIN -->\n'
  + '<script>(function(){try{if(localStorage.getItem(\'cr_pin\')===\'off\')document.documentElement.classList.add(\'nopin\');}catch(e){}})();</script>\n'
  + '<style>'
  + 'html.nopin .sitebar,html.nopin header,html.nopin .mm-sticky,html.nopin #diagResult.tab-sim .dg-deckbar{position:static!important}'
  + 'html.nopin{height:auto!important;overflow:visible!important}'
  + 'html.nopin body{position:static!important;inset:auto!important;height:auto!important;min-height:100vh;overflow:visible!important;overflow-y:visible!important;display:block!important}'
  + 'html.nopin .app{display:block!important;flex:none!important;height:auto!important;min-height:0!important;overflow:visible!important}'
  + 'html.nopin .left,html.nopin .right{flex:none!important;height:auto!important;max-height:none!important;overflow:visible!important;touch-action:auto!important}'
  + 'html.nopin .card-list,html.nopin .deck-slots{overflow:visible!important;height:auto!important;max-height:none!important;flex:none!important}'
  + '@media (max-width:720px){'
  + 'html.nopin body.cr-builder{position:fixed!important;inset:0!important;height:auto!important;min-height:0!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;overscroll-behavior-y:none!important}'
  + 'html.nopin .app{display:flex!important;flex-direction:column!important;flex:1 1 0%!important;height:auto!important;min-height:0!important;overflow:hidden!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;overscroll-behavior-y:contain!important}'
  + 'html.nopin .right{flex:0 0 auto!important;overflow:visible!important;touch-action:auto!important}'
  + 'html.nopin .left{flex:0 0 auto!important;height:auto!important;overflow:visible!important}'
  + 'html.nopin .card-list,html.nopin .deck-slots{overflow:visible!important;height:auto!important;max-height:none!important;flex:none!important}'
  + 'html.nopin body.cr-builder .footer-signature{flex:0 0 auto!important}'
  + '}'
  + '.bar-pin-btn{cursor:pointer}'
  + '.nav-icon{color:var(--text)!important;border:1px solid var(--border-hi)!important;background:var(--surface2)!important;box-shadow:0 1px 2px rgba(0,0,0,.22)!important;width:36px!important;height:36px!important}'
  + '.nav-icon .nav-emoji svg{stroke-width:2.1}'
  + '.nav-icon.active{color:var(--accent)!important;border-color:var(--accent)!important;background:rgba(232,160,32,.16)!important;box-shadow:0 0 0 1px rgba(232,160,32,.35),0 0 10px -2px rgba(232,160,32,.55)!important}'
  + '@media(hover:hover){.nav-icon:hover{color:var(--accent)!important;border-color:var(--accent)!important;background:var(--surface)!important;transform:translateY(-1px)}}'
  + '.bar-pin-btn{color:var(--accent)!important;border-color:rgba(232,160,32,.5)!important;background:rgba(232,160,32,.12)!important}'
  + '.bar-pin-btn.off{opacity:1!important;color:var(--text-muted)!important;border-color:var(--border-hi)!important;background:var(--surface2)!important}'
  + '@media(max-width:720px){.nav-icon{width:34px!important;height:34px!important}}'
  + '</style>\n'
  + '<script>document.addEventListener(\'DOMContentLoaded\',function(){'
  + 'var ja=(document.documentElement.lang||\'ja\').slice(0,2)===\'ja\';'
  + 'var P=\'<span class="nav-emoji"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.8a2 2 0 0 0-1.1-1.8l-1.8-.9A2 2 0 0 1 15 10.8V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg></span>\';'
  + 'var rows=document.querySelectorAll(\'.nav-icons\');'
  + 'for(var i=0;i<rows.length;i++){(function(row){'
  + 'if(row.querySelector(\'.bar-pin-btn\'))return;'
  + 'var b=document.createElement(\'button\');b.type=\'button\';b.className=\'nav-icon bar-pin-btn\';b.innerHTML=P;'
  + 'function paint(){var off=document.documentElement.classList.contains(\'nopin\');b.classList.toggle(\'off\',off);b.title=off?(ja?\'固定する\':\'Pin layout\'):(ja?\'固定を解除\':\'Unpin layout\');b.setAttribute(\'aria-pressed\',off?\'false\':\'true\');}'
  + 'b.addEventListener(\'click\',function(){var off=!document.documentElement.classList.contains(\'nopin\');document.documentElement.classList.toggle(\'nopin\',off);try{localStorage.setItem(\'cr_pin\',off?\'off\':\'on\');}catch(e){}paint();});'
  + 'paint();row.insertBefore(b,row.firstChild);'
  + '})(rows[i]);}'
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
  const shouldIndex = INDEX_LANGS.includes(lang);
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
  h = setRobots(h, shouldIndex ? 'index,follow' : 'noindex,follow');
  h = setCanonical(h, url);
  if (shouldIndex) h = h.replace(/<\/head>/i, hreflangBlock(page) + '\n</head>');
  h = injectUnpin(injectVT(injectTheme(injectGA(h))));
  h = shouldIndex ? injectAdSense(h) : stripAdSense(h);
  const cdict = contentDict(lang);
  if (cdict) {
    const st = (SWAP_STATS[lang] = SWAP_STATS[lang] || { total: 0, done: 0 });
    h = swapBodyText(h, cdict, st);
  }
  return h;
}

/* ★lastmod は「本当にそのファイルが変わった日」を出す（2026-08-11）
 * それまで全URLに実行日を焼いていたが、毎日走らせる仕組みなので
 * 中身が同じページにも今日の日付が付き、133URLすべてが同じ日になっていた。
 * Googleは lastmod が不正確なサイトマップの日付を無視するため、
 * クロールの優先付けに効かないどころか信頼を落とす。
 *   - HEAD と差があるファイル（今回の生成で中身が変わった）→ 今日
 *   - 差がないファイル → git の最終コミット日
 *   - git が使えない/履歴が無い場合 → 今日（安全側）
 * ※CIでは actions/checkout に fetch-depth: 0 が必要（履歴が無いと日付が取れない）。 */
let _dirtySet = null;
function dirtyFiles() {
  if (_dirtySet) return _dirtySet;
  _dirtySet = new Set();
  try {
    const out = execFileSync('git', ['status', '--porcelain', '--', '.'], { cwd: ROOT, encoding: 'utf8' });
    out.split('\n').forEach(line => {
      const m = line.trim().match(/^\S+\s+(.+)$/);
      if (m) _dirtySet.add(m[1].replace(/^"|"$/g, ''));
    });
  } catch (e) { /* gitが無ければ全部「今日」扱いになる */ }
  return _dirtySet;
}
function lastmodOf(relPath) {
  if (dirtyFiles().has(relPath)) return TODAY;          // 今回変わった＝今日
  try {
    const d = execFileSync('git', ['log', '-1', '--format=%cs', '--', relPath], { cwd: ROOT, encoding: 'utf8' }).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  } catch (e) { /* 履歴なし */ }
  return TODAY;
}

function writeSitemap() {
  let out = '<?xml version="1.0" encoding="UTF-8"?>\n';
  out += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n';
  const cf = { 'index.html': 'weekly', 'decks.html': 'daily', 'strategy.html': 'monthly', 'guide.html': 'monthly', 'about.html': 'yearly', 'faq.html': 'monthly', 'glossary.html': 'monthly' };
  const pr = { 'index.html': '1.0', 'decks.html': '0.9', 'strategy.html': '0.7', 'guide.html': '0.85', 'about.html': '0.65', 'faq.html': '0.7', 'glossary.html': '0.7' };
  GEN.forEach(page => {
    INDEX_LANGS.forEach(lang => {
      out += '  <url>\n    <loc>' + pageUrl(lang, page) + '</loc>\n';
      INDEX_LANGS.forEach(l => { out += '    <xhtml:link rel="alternate" hreflang="' + HREFLANG[l] + '" href="' + pageUrl(l, page) + '"/>\n'; });
      out += '    <xhtml:link rel="alternate" hreflang="x-default" href="' + pageUrl('ja', page) + '"/>\n';
      const relPath = (lang === 'ja') ? page : (lang + '/' + page);
      out += '    <lastmod>' + lastmodOf(relPath) + '</lastmod>\n    <changefreq>' + (cf[page] || 'monthly') + '</changefreq>\n    <priority>' + (pr[page] || '0.4') + '</priority>\n  </url>\n';
    });
  });
  /* ★カード個別ページ（/cards/*.html）もsitemapへ。2026-08-11追加。
     AdSense「有用性の低いコンテンツ」対策で122枚の実データページを静的生成したので、
     クロール対象に入れないと意味がない。日本語のみ（翻訳版は作らない）。 */
  const cardsDir = path.join(ROOT, 'cards');
  let nCards = 0;
  if (fs.existsSync(cardsDir)) {
    fs.readdirSync(cardsDir).filter(f => f.endsWith('.html')).sort().forEach(f => {
      const url = 'https://crdeckbuilders.com/cards/' + f;
      out += '  <url>\n    <loc>' + url + '</loc>\n';
      out += '    <lastmod>' + lastmodOf('cards/' + f) + '</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>' + (f === 'index.html' ? '0.8' : '0.6') + '</priority>\n  </url>\n';
      nCards++;
    });
  }
  out += '</urlset>\n';
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), out);
  if (nCards) console.log('sitemap: カードページ ' + nCards + '件を追加');
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
  GEN.forEach(p => {
    let h = injectHreflang(src[p], p);
    h = setRobots(h, 'index,follow');
    h = injectUnpin(injectVT(injectTheme(injectGA(injectAdSense(h)))));
    fs.writeFileSync(path.join(ROOT, p), h);
  });
  const swapped = Object.keys(SWAP_STATS);
  if (swapped.length) {
    swapped.forEach(l => {
      const s = SWAP_STATS[l];
      console.log('i18n-content ' + l + ': 本文 ' + s.done + '/' + s.total + ' 置換（未訳 ' + (s.total - s.done) + '）');
    });
  } else {
    console.log('i18n-content: 辞書なし（本文は日本語のまま。tools/i18n-extract.js で抽出→翻訳を投入）');
  }
  writeSitemap();
  console.log('generated ' + n + ' lang pages (' + GEN.join(',') + ') for [' + TARGETS.join(', ') + '] + hreflang + sitemap; index langs=[' + INDEX_LANGS.join(', ') + '], reviewMode=' + REVIEW_MODE);
}
main();
