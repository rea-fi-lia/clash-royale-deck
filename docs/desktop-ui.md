# Desktop UI and owner dashboard

Desktop presentation activates at 1024px and above. Mobile styles, builder behavior and the saved mobile pin preference are preserved. Shared `/css/desktop.css` and `/js/desktop.js` provide a horizontal navigation bar, eight deck slots in one row, optional sticky deck, fixed creator footer, keyboard search and reduced-motion support.

The desktop card action popover resets the original centered transform and conflicting vertical anchors. Both actions use equal grid columns and stretch to the same height. Localized desktop card-detail links resolve to the shared `/cards/` pages. New desktop copy covers all 18 supported languages, including live language switching.

Root HTML files are the language generator inputs. Run `node tools/gen-i18n.js` after changing the shell; the card-page generator inherits it from `glossary.html`. Keep desktop assets at absolute paths and update the cache version using the existing release convention.

`/admin.html` is a noindex static shell. It only shows management data after `/api/admin/summary` verifies a signed Google/Firebase session and the server-side owner setting. The account-menu link appears only after `/api/admin/session` authorizes the user. Server source and credentials do not belong in this public repository. Missing integrations show their connection status, never invented zero values.

Validation: syntax checks; 17 language directories regenerated; internal-link/card-image lint; desktop card add/detail navigation and aligned buttons at 1024 and 1440; pin/unpin footer; English/German language switching; mobile 390px comparison of 129 element rectangles/styles; private API authentication tests in the separate server project.

## 2026-09-22 操作改善

戻る操作の状態復元、項目単位の初回チュートリアル、ガイドの装飾の適用範囲、登録済みタグとマイページの改善は [操作仕様](user-experience.md) を参照。チュートリアルはPC用、携帯のデッキ画面構成は維持。
