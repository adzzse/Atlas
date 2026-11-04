# Change note

Sổ theo dõi tùy biến của `adzzse/Atlas`, lập ngày **03/09/2026**, cập nhật theo code/test ngày **04/11/2026**. Dùng để đối chiếu sau mỗi lần đưa thay đổi từ Nightly gốc vào Fork; không thay thế `CHANGELOG.md` và `NIGHTLY.CHANGELOG.md` của upstream.

## 1. Trạng thái source và mốc lịch sử

### Source đối chiếu ngày 04/11/2026

- Branch `fork`, remote cá nhân `origin=https://github.com/adzzse/Atlas.git`; upstream `https://github.com/towerwatchman/Atlas.git`, push URL `DISABLED`.
- Fork trước lần merge này: `6f3bd03fe11a2b31f89377cd6ea3ec91b4abf443`, trùng `origin/fork` khi fetch. Nightly đã tích hợp trước đó: `a226109ed602255727f6782b2fb611b580ccea99` qua merge `f6dc5be4975d1efaebb83d005c4b929ab721dead`.
- Nguồn lần này: `upstream/nightly` tại `464cdc0468f53d91a27b15f2d7ea6d97647ef262`, changelog `0.9.15-nightly.518`, version nền `package.json` là `0.9.15`. Có 15 commit upstream mới; dùng merge thường hai parent, giữ nguyên lịch sử fork đã push.
- SHA tích hợp là merge commit chứa bản cập nhật note này; parent thứ nhất là `6f3bd03`, parent thứ hai là `464cdc0`. Không ghi SHA của chính commit vào nội dung của nó.
- Phạm vi xác nhận hiện tại là source, test tự động và renderer build. **Không xác nhận phiên bản app đang cài/chạy, installer, updater hay dữ liệu thật trong lần này.** Các thông tin bên dưới là lịch sử, không phải kết quả runtime ngày 04/11.

### Mốc lịch sử 03/09/2026

- Repo cá nhân: [adzzse/Atlas](https://github.com/adzzse/Atlas), branch làm việc và phát hành: `fork`.
- Nguồn mã gốc: [towerwatchman/Atlas — nightly](https://github.com/towerwatchman/Atlas/tree/nightly). Baseline khi hoàn tất tính năng: `cd8ad077b36050d2ab1934b3ddd2483e5df55198`.
- Local: `E:\Code\Other\Atlas`; `origin` trỏ repo cá nhân; `upstream` chỉ fetch `nightly`, push URL là `DISABLED`.
- App đã cài: `D:\Tools\Atlas\Atlas.exe`, hiển thị **Running build: fork / 0.9.9-fork.1 (local)**, build từ commit `2c0e460c02ce941ad92f8a4800563724dc3e2f56`.
- HEAD khi lập note: `fa5063842ecb987137a4155c2a2941df04184e33`, đã đồng bộ `origin/fork`.
- [Release v0.9.9-fork.2](https://github.com/adzzse/Atlas/releases/tag/v0.9.9-fork.2) đã được CI phát hành thành công. Chưa cài bản này trong lần lập note; bản đang chạy vẫn là `.1 (local)`. Commit `.2` chỉ thêm workflow và test workflow, không đổi mã app so với `.1`.
- Dữ liệu: `D:\Tools\Atlas\data`. Bản sao lưu trước cài Fork: `D:\Tools\Atlas-backup-20260902-before-fork`.

`local` / `github-actions` là **nguồn tạo binary**, không phải kênh update thứ tư. App nhận bản mới từ CI của repo cá nhân vẫn là Fork dù nhãn nguồn build đổi sang `github-actions`.

## 2. Các tính năng và ràng buộc phải giữ

### F01 — Ba kênh cập nhật, tách biệt phiên bản đang chạy

| Kênh | Repo cấp bản cập nhật | Manifest | Prerelease |
| --- | --- | --- | --- |
| Fork | `adzzse/Atlas` | `fork.yml` | Có |
| Stable | `towerwatchman/Atlas` | `latest.yml` | Không |
| Nightly | `towerwatchman/Atlas` | `nightly.yml` | Có |

- Binary có version `-fork.N` mặc định dùng Fork. Kênh đã chọn không được làm sai nhãn phiên bản thực sự đang chạy.
- Giữ baseline riêng `Updates.stableVersion`, `Updates.nightlyVersion`, `Updates.forkVersion`; chỉ ghi nhận phiên bản cho đúng loại binary đang chạy. Không thay đối tượng SemVer nội bộ của updater bằng đối tượng từ bản thư viện khác.
- Mã: `electron/config/configSchema.js`, `electron/ipc/updater.js`, `src/components/settings/Interface.jsx`.
- Kiểm chứng: `tests/fork-updates.test.js`, `tests/fork-update-ui.test.jsx`.

### F02 — Chặn chuyển kênh gây mất tùy biến ngoài ý muốn

- Khi đang chạy Fork, chọn Stable/Nightly phải xác nhận cảnh báo: cài binary gốc sẽ thay thế các tính năng cá nhân, kể cả cơ chế cập nhật Fork. Muốn giữ tùy biến thì tiếp tục chọn Fork.
- Không đổi kênh khi updater đang kiểm tra, tải, đã tải chờ cài hoặc đang cài. Kiểm tra điều kiện trước khi ghi config; đổi kênh thành công phải xóa đề nghị cập nhật cũ.
- Lưu settings không được ghi đè các giá trị `Updates` do main process quản lý bằng state cũ của renderer; UI phải hiển thị lỗi nếu lưu bị từ chối.
- Mã: `electron/ipc/updater.js`, `electron/ipc/settings.js`, `src/components/settings/Interface.jsx`, `src/hooks/useAppUpdate.js`.
- Kiểm chứng: `tests/fork-updates.test.js`, `tests/fork-update-settings.test.js`, `tests/fork-update-ui.test.jsx`.

### F03 — Tự kiểm tra và cập nhật từ Fork

- Giữ tùy chọn kiểm tra lúc khởi động; app đóng gói đang chọn Fork còn kiểm tra định kỳ **30 phút khi app chạy**. Không làm gián đoạn offer/download/install đang có.
- Tải/cài bằng luồng updater trong app, giữ thư mục cài hiện tại. `autoDownload=false`, `autoInstallOnAppQuit=false`: không âm thầm tải hoặc cài chỉ vì thoát app.
- Repo Fork chưa có release hợp lệ thì báo chưa có bản mới; không tự chuyển sang repo gốc để lấy binary.
- Mã: `electron/main.js`, `electron/ipc/updater.js`, `src/hooks/useAppUpdate.js`.
- Kiểm chứng: `tests/fork-updates.test.js` và smoke test cập nhật binary thật.

### F04 — Thông báo Nightly gốc độc lập với kênh Fork

- App đóng gói kiểm tra release Nightly gốc lúc khởi động và mỗi **30 phút khi app chạy**, độc lập với kênh đang chọn.
- Chỉ nhận prerelease đã publish, tag đúng dạng `vX.Y.Z-nightly.N`, có `nightly.yml` và installer `.exe` đã upload, không rỗng.
- Hiện thông báo giữ lại cho người dùng với hành động xem release notes; không đổi feed, tải binary gốc hay tự merge mã nguồn.
- Lưu `Updates.upstreamNightlyTag` sau khi renderer đã đưa thông báo ra để không lặp cùng tag; giữ thông báo pending nếu renderer chưa sẵn sàng.
- Khi mở lại app sau thời gian offline, đối chiếu các release gần đây để báo bù. API chỉ lấy tối đa 100 release; không cam kết thông báo riêng từng bản nằm ngoài lịch sử đó. App đóng thì không có tiến trình theo dõi riêng.
- Mã: `electron/utils/upstreamNightly.js`, `electron/main.js`, `electron/preload.js`, `src/hooks/useAppUpdate.js`.
- Kiểm chứng: `tests/upstream-nightly.test.js`, `tests/fork-update-ui.test.jsx`.

### F05 — Build cá nhân có danh tính rõ ràng, không đóng gói dữ liệu riêng

- `npm run build` tạo Fork local qua `scripts/build-fork.js`. `FORK_BUILD_NUMBER=N` tạo version `<version gốc>-fork.N`; không sửa version nền của `package.json` chỉ để gắn số Fork.
- `fork.0` dành cho build local mặc định; publish phải dùng số lớn hơn 0. Ghi `atlasBuildSource` và `atlasBuildCommit`; UI hiển thị loại build, version và nguồn build.
- Cấu hình publish phải chỉ rõ owner `adzzse`, repo `Atlas`, channel `fork`. Output nằm trong `release/fork-N`; loại `electron/data/**/*` khỏi gói app.
- Mã: `package.json`, `scripts/build-fork.js`, `electron/ipc/settings.js`, `src/components/settings/Interface.jsx`.
- Kiểm chứng: test metadata/UI và kiểm tra `resources/app.asar` sau khi build.

### F06 — CI phát hành Fork Windows an toàn

- `.github/workflows/fork.yml`: chạy khi push branch `fork` hoặc chạy thủ công, nhưng chỉ trên `adzzse/Atlas` và ref `refs/heads/fork`.
- Windows x64, Node 22; thứ tự bắt buộc: `npm ci` → `npm run check` → tạo draft → build/upload → kiểm tra đủ assets → publish prerelease, không đánh dấu latest stable.
- Bắt buộc có installer `.exe`, `.exe.blockmap`, `fork.yml` đã upload và không rỗng. Không ghi đè release đã publish; các lần chạy được xếp hàng, không hủy bản đang phát hành.
- Số build CI = `GITHUB_RUN_NUMBER + 1`: `.0` local, `.1` bootstrap local đã phát hành, CI lần đầu là `.2`. Không tự dùng lại số release đã có; ưu tiên workflow cấp số cho những bản phát hành tiếp theo.
- Nếu upload thủ công, tên asset phải khớp URL trong `fork.yml`: ví dụ `Atlas-Setup-0.9.9-fork.1.exe`, không giữ dấu cách sau `Setup` của file build local.
- Kiểm chứng: `tests/fork-release-workflow.test.js` và một workflow run thực sự thành công.

### F07 — Release notes đúng repo

- Version Fork mở release trên `adzzse/Atlas`; Stable/Nightly vẫn mở release gốc. Thông báo Nightly độc lập luôn dẫn về upstream.
- Mã: `src/utils/releaseUrl.js`, `src/hooks/useAppUpdate.js`.
- Kiểm chứng: `tests/release-url.test.js`, `tests/fork-update-ui.test.jsx`.

### F08 — Giữ kết nối dữ liệu gốc và dữ liệu cá nhân

- Không đổi nguồn catalog trong `electron/db/updates.js`: `https://atlas-gamesdb.com/api/updates`, gói dữ liệu từ `https://atlas-gamesdb.com/packages/`.
- Giữ appId `com.towerwatchman.atlas`, tên sản phẩm Atlas, đường dẫn dữ liệu cạnh app và logic installer bảo toàn `data/`, `launchers/`.
- Không đóng gói database/tài khoản cá nhân, không reset database để thử cập nhật. Sao lưu dữ liệu trước khi cài bản mới có thay đổi schema.
- Đây là ràng buộc bảo toàn, không phải một dịch vụ database mới của Fork. Kiểm chứng bằng catalog runtime, database read-only và đối chiếu dữ liệu sau cài.

### F09 — Media refresh chịu lỗi CDN và không tải thừa

- Mỗi request ảnh có deadline tổng và timeout **30 giây**, chỉ thử **một lần trong một lượt refresh**. Atlas bỏ qua URL lỗi, tiếp tục ảnh kế tiếp và báo số ảnh thất bại; không retry 2–3 lần khi CDN đang lỗi.
- Một lỗi tải GIF được ghi nhớ trong chính lần xử lý đó, nên nhánh animated và ảnh tĩnh không tạo request thứ hai cho cùng URL.
- Tiến độ vẫn đi đến cuối khi ảnh lỗi hoặc source bị rate-limit. Refresh từng game và toàn thư viện trả/hiển thị số ảnh lỗi; file tải thành công được giữ lại.
- Trang chi tiết dùng modal trong app của Nightly để báo refresh có ảnh lỗi, giữ nguyên số lỗi và lỗi đầu tiên của Fork; không gọi native `alert` trong nhánh này. Esc không rời trang khi modal xác nhận/cảnh báo đang mở.
- `Missing only` không dùng điều kiện “đã có ít nhất một preview” cho cả bộ. `downloadImages()` kiểm tra file xác định của từng banner/preview/asset và chỉ tải derivative còn thiếu.
- Cửa sổ chi tiết không `new Image()` toàn bộ preview trước khi render. `SafeImage` xử lý lỗi từng ảnh và preview dùng `loading="lazy"` để chỉ tải khi cần hiển thị.
- Mã: `electron/imageUtils.js`, `electron/ipc/media.js`, `src/App.jsx`, `src/components/detail/GameDetailPage.jsx`, `src/components/detail/GameDetailsWindow.jsx`, `src/components/detail/window/MediaTab.jsx`.
- Kiểm chứng: `tests/media-download-resilience.test.js`, `tests/media-db-helpers.test.js`, `tests/detail-dialogs.test.jsx`, `npm run check` và commit gốc `cdf30140a4cb266de2116cd46191d811b12424da`.

### F10 — Download từ Wishlist tự lưu media local

- Khi một download từ Wishlist/Browse được cài thành công và lần đầu promote thành record trong Library, Atlas tự chạy `missing` media refresh ở nền nếu `Metadata.mediaStorageMode=download`.
- Luồng này không phụ thuộc hai tùy chọn ảnh riêng của Importer vì Download Manager không đi qua `import-games`. Chế độ `stream` vẫn không ghi ảnh local.
- Lỗi CDN/media chỉ được ghi nhận và không biến một game đã cài thành công thành cài đặt thất bại. Downloader dùng lại toàn bộ cơ chế chịu lỗi của F09, không có bản tải ảnh thứ hai.
- Hook promote dùng `autoDownloadPromotedMedia` với `ctx.refreshGameMedia`; nhánh tải media sau cài của Nightly chỉ chạy khi `!promotion`. Giữ cả hai để game đã có record cũng được bổ sung ảnh mà game vừa promote không tải lặp.
- Mã: `electron/ipc/importer.js`, `electron/ipc/media.js`.
- Kiểm chứng: `tests/wishlist-download-media.test.js`, `tests/media-download-resilience.test.js` và `npm run check`.

### F11 — Lưu thứ tự Library và Wishlist độc lập

- Lưu cả trường sort và chiều sort cho từng view trong `localStorage.atlasViewSortPreferences`. Chuyển view hoặc khởi động lại renderer khôi phục thứ tự đã lưu; dữ liệu thiếu/hỏng trở về mặc định `name/asc`.
- Browse dùng sort phía server riêng, không ghi đè hai lựa chọn này. Mọi filter sidebar dùng cùng luồng cập nhật của `App`.
- Mã: `src/utils/viewSortPreferences.js`, `src/App.jsx`, `src/hooks/useFilters.js`.
- Kiểm chứng: `tests/view-sort-preferences.test.js`.

### F12 — Ẩn game của collection khỏi Library chính

- Checkbox chuột phải của collection lưu `hide_from_library`; thành viên bị ẩn chỉ khỏi Library chính. Game vẫn được cài và vẫn hiện khi mở collection chứa nó, kể cả một collection khác cùng chứa game đó.
- Thay đổi membership tự áp dụng quy tắc ẩn; không sao chép cờ lên từng game. Xóa collection chỉ xóa nhóm và membership, không xóa game.
- Mã: `electron/db/collections.js`, `electron/ipc/windows.js`, `src/components/collections/collectionMenu.js`, `src/hooks/useCollections.js`, `src/hooks/useFilters.js`, `src/App.jsx`.
- Kiểm chứng: `tests/collections-logic.test.js`, `tests/context-action-result.test.js`.

### F13 — Creator folders theo collection và xem trước đích cài

- `group_by_creator` mặc định tắt; collection bật tùy chọn dùng `{creator}/{title}/{version}` cho lần cài/import tiếp theo. Membership hiện có hoặc collection đang chọn đều được xét; collection thường giữ cấu trúc Library toàn cục.
- Download install, import từ catalog/local, batch importer và preview đích dùng chung `resolveLibraryFolderStructure`. Chọn collection để xem trước không tự tạo membership; đổi tùy chọn không tự di chuyển thư mục game đã cài.
- Mã: `electron/db/collections.js`, `electron/ipc/collections.js`, `electron/ipc/importer.js`, `electron/ipc/windows.js`, `electron/preload.js`, `src/components/library/LibraryDestination.jsx`, các form collection/install/import và `src/App.jsx`.
- Kiểm chứng: `tests/collection-folder-layout.test.js` (SQLite thật và wiring các đường cài/import), `tests/library-destination.test.jsx`.

### F14 — Ưu tiên banner đã tải nhưng giữ fallback

- Banner custom luôn thắng. Ở chế độ `download`, banner tải về có file thật được ưu tiên nhưng vẫn giữ candidate remote theo thứ tự nguồn để renderer fallback khi cần.
- Giữ kiểm tra file tồn tại của Nightly; không ghim vào file đã mất. Không thay chuỗi fallback của Fork bằng danh sách chỉ có một banner tải về.
- Mã: `electron/db/mediaSources.js`, `electron/ipc/games.js`.
- Kiểm chứng: `tests/downloaded-banner-preference.test.js`, `scripts/check-steam-local-media-sources.js`.

### F15 — Windows game cần quyền administrator

- Chờ sự kiện `spawn` trước khi báo launch thành công. Khi Windows từ chối EXE bằng `EACCES`, dùng `shell.openPath` để Windows hiện UAC; launch thường vẫn theo dõi child process.
- Lỗi launch được trả về và hiện trong modal của trang chi tiết. Launch được nâng quyền dùng play session không gắn child process, không coi đây là phép kiểm chứng theo dõi process nâng quyền đầy đủ.
- Mã: `electron/ipc/games.js`, `src/components/detail/GameDetailPage.jsx`.
- Kiểm chứng: `tests/game-launch.test.js`; chưa thử UAC/game thật trong lần sync này.

### F16 — Wishlist có dữ liệu sort ngày và metrics đầy đủ

- Hydrate ngày cập nhật F95/LewdCorner cùng likes, views và hai community rating từ catalog trước khi sort; không fallback sang tên chỉ vì record Wishlist thiếu các cột này.
- So sánh metrics dùng giá trị lớn hơn giữa F95/LewdCorner như Library/Browse; vẫn giữ rating từng nguồn để hiển thị. Normalize nhận cả tên cột SQL và tên field renderer.
- Mã: `electron/db/wishlist.js`, `src/hooks/useFilters.js`.
- Kiểm chứng: `tests/wishlist-sort.test.js` (hydrate qua SQLite, chiều sort, dữ liệu LC và parity với catalog).

### F17 — Last Updated trong Details

- Hiển thị ngày cập nhật nguồn tách biệt Release Date cho Library/Wishlist/Browse. Chấp nhận ngày F95, LC, timestamp giây/mili giây; không tự dùng ngày phát hành Steam thay cho ngày cập nhật.
- Mã: `src/components/detail/GameDetailPage.jsx`, `src/hooks/useFilters.js`.
- Kiểm chứng: `tests/detail-last-updated.test.jsx`.

### F18 — Minimize to tray và dừng media khi ẩn

- `Interface.minimizeToTray` mặc định tắt, áp dụng ngay khi lưu. Khi bật, minimize ẩn main window nhưng giữ background tasks; tray có Open Atlas/Exit. Nút đóng vẫn thoát Atlas theo luồng cũ.
- Trì hoãn `hide()` đến sau native minimize dispatch; hủy hide cũ nếu restore/quit/close xảy ra. Restore gọi `show()` rồi focus kể cả khi native restore đã báo visible; cleanup không đọc `webContents` đã bị hủy.
- Đồng bộ trạng thái visible qua preload, pause video khi ẩn và tháo iframe trailer; hiện lại không tự phát tiếp trailer vừa bị ngắt.
- Mã: `electron/mainWindowTray.js`, `electron/main.js`, `electron/ipc/settings.js`, `electron/preload.js`, `src/App.jsx`, `src/components/settings/Interface.jsx`, `src/utils/windowMedia.js`, `src/components/detail/page/PreviewLightbox.jsx`, `src/assets/css/main.css`.
- Kiểm chứng: `tests/main-window-tray.test.js`, `tests/interface-tray.test.jsx`, `tests/window-media.test.js`, `tests/preview-tray.test.jsx`. Các test mock native boundary; chưa thao tác tray trên app đã cài trong lần này.

### F19 — Điều khiển đúng cửa sổ và Show Atlas

- Caption IPC lấy `BrowserWindow.fromWebContents(event.sender)` để minimize/maximize/close đúng cửa sổ gửi. Preload hỏi state ban đầu, bỏ phản hồi cũ nếu đã có native event mới và trả hàm hủy listener.
- Extension Show Atlas dùng getter main window còn sống, không dùng cửa sổ đầu tiên từ `getAllWindows`; main window thiếu/đã đóng trả HTTP 503. Giữ wiring ở startup và cả hai đường restart server.
- Mã: `electron/ipc/windows.js`, `electron/preload.js`, `electron/rpc/extensionServer.js`, `electron/ipc/extension.js`, `electron/main.js`.
- Kiểm chứng: `tests/window-controls.test.js`, `tests/extension-window-routing.test.js`. Không mở rộng preload bridge hay allowlist trong lần sync này.

## 3. Checklist khi Nightly có bản mới

Thông báo Nightly ≠ merge source ≠ phát hành Fork ≠ cài binary. Hiện **không có auto-merge upstream vào Fork**; CI chỉ build mã đã được đưa lên branch `fork`.

1. Ghi tag/commit Nightly muốn tích hợp. Kiểm tra thay đổi local; commit phần cần giữ hoặc sao lưu riêng trước khi merge. Không bỏ qua file chưa được Git theo dõi, bao gồm note này nếu chưa commit.
2. Tạo bản sao lưu dữ liệu mới trước khi thử installer; không ghi đè bản backup ban đầu. Có thể tạo branch dự phòng tại HEAD hiện tại trước khi merge lớn.
3. Thực hiện trên branch `fork`, chỉ lấy `upstream/nightly`. Các lệnh dưới đây là hướng dẫn, không phải tác vụ tự chạy của note:

```powershell
git status --short --branch
git remote -v
git switch fork
git fetch upstream nightly
git merge --no-commit --no-ff upstream/nightly
```

4. Đọc diff và giải quyết conflict theo F01–F19, đối chiếu hành vi bằng code/test thay vì bắt buộc giữ triển khai cũ. Có thể dùng triển khai Nightly nếu đáp ứng đầy đủ ràng buộc tương ứng; ghi rõ phần giữ/thay thế và giới hạn kiểm chứng. Không chọn toàn bộ “theirs”/“ours”, dùng `reset --hard`, rebase lịch sử đã push hay force-push. Dòng GitHub so sánh với `main` không phải lý do để merge `main`.
5. Chạy test và build kiểm tra:

```powershell
npm ci
npm run check
git diff --check
git diff --cached --check
git diff --cached
```

6. Nếu FAIL/conflict chưa giải quyết: dừng, chưa push/publish. Khi PASS, kiểm tra staged diff chỉ có thay đổi dự kiến rồi commit merge và `git push origin fork`; push này kích hoạt CI. Không push `upstream`, không tạo PR vào repo gốc.
7. Kiểm tra CI thành công, release không còn draft, tag/commit đúng, đủ ba assets và manifest chỉ về repo cá nhân. Đọc source metadata nếu cần xác nhận binary được build từ commit nào.
8. Smoke test sau cài: app vẫn ở `D:\Tools\Atlas`, kênh Fork và nhãn build đúng; có đủ ba lựa chọn; catalog gốc hoạt động; dữ liệu cá nhân còn nguyên; thông báo Nightly không đổi kênh; thử cảnh báo chuyển sang bản gốc rồi **Cancel**, không cài bản gốc chỉ để test.
9. Khi có Fork mới hợp lệ, kiểm tra tải/cài thật, version sau restart và đường dẫn cài. Test tự động không thay thế bước installer/runtime này. Ghi PASS/PARTIAL/FAIL và bằng chứng vào mục 6; chưa test runtime thì ghi PARTIAL.

Note là checklist, không tự bảo vệ code khỏi conflict. Mỗi tính năng cá nhân mới cần cập nhật note cùng file liên quan và test hồi quy; đối chiếu hành vi chứ không chỉ kiểm tra file còn tồn tại.

## 4. Bằng chứng tại mốc 03/09/2026

- **PASS — kiểm tra mã:** `npm run check`, 126 test files, 1.388 tests passed, 7 skipped; kiểm tra JS/IPC/preload và build renderer đạt. Có 67 ESLint warnings, 0 errors; không coi warning có sẵn là đã được sửa.
- **PASS — cập nhật thật:** `.0` → `.1` qua updater của Fork, lấy installer từ `adzzse/Atlas`; người dùng xác nhận `.1 (local)`. SHA256 của `app.asar` đã cài khớp bản build local.
- **PASS — giữ dữ liệu sau `.1`:** `PRAGMA quick_check` = `ok`; đối chiếu toàn bộ nội dung với backup: `games` 22, `versions` 22, `collections` 2, `collection_games` 13, `wishlist_entries` 73, `game_personal_ratings` 1, đều không đổi. Hash `accounts.json` và `saved_filters.json` không đổi. Các số lượng này là snapshot, không phải giá trị bắt buộc sau khi người dùng sử dụng app thêm.
- **PASS — nguồn catalog:** API gốc trả HTTP 200; mã đồng bộ catalog trong bản cài khớp source không bị chỉnh sửa.
- **PASS — phát hành CI:** [run 33661510233](https://github.com/adzzse/Atlas/actions/runs/33661510233) thành công; release `.2` có đủ installer, blockmap và `fork.yml`, đã publish prerelease. Chưa kiểm chứng cài `.2` trong mốc này.
- **PASS — media refresh chịu lỗi:** test đỏ đã tái hiện request GIF bị gọi hai lần, `Missing only` bỏ qua bộ preview tải dở và renderer preload toàn bộ URL. Sau fix, mỗi URL lỗi chỉ gọi một lần với deadline 30 giây, ảnh sau vẫn tải, tiến độ đạt cuối và số lỗi được trả về. Full check: 127 test files, 1.388 passed, 7 skipped; renderer build đạt.
- **PARTIAL — Wishlist tự tải media:** regression test đã chạy đỏ trước fix rồi xanh; `npm run check` PASS với 129 test files, 1.395 passed, 7 skipped và installer local `.4` chứa đúng hook tự tải. Chưa smoke test cài đặt/download thật ở thời điểm ghi dòng này.
- Ghi nhận updater `.1`: tải differential gặp SHA512 mismatch rồi tự fallback tải đầy đủ thành công. Không kết luận differential đã hoạt động; kết quả cài cuối cùng đã được xác nhận. Log: `D:\Tools\Atlas\data\chrome\atlas-updater.log`.
- `npm ci` báo 5 dependency advisories có sẵn (1 moderate, 4 high); chưa xử lý trong phạm vi tùy biến Fork này. Cần đánh giá riêng khi nâng dependency.

## 5. Commit đã đưa vào Fork

`2c0e460c02ce941ad92f8a4800563724dc3e2f56` — **feat: support personal fork builds and updates**

Các file chính xác trong commit (đường dẫn tương đối từ gốc repo):

```text
electron/config/configSchema.js
electron/ipc/settings.js
electron/ipc/updater.js
electron/main.js
electron/preload.js
electron/utils/upstreamNightly.js
package.json
scripts/build-fork.js
src/components/settings/Interface.jsx
src/hooks/useAppUpdate.js
src/utils/releaseUrl.js
tests/fork-update-settings.test.js
tests/fork-update-ui.test.jsx
tests/fork-updates.test.js
tests/release-url.test.js
tests/upstream-nightly.test.js
```

Kiểm chứng: các test Fork/settings/UI/Nightly/release URL, `npm run check`, build Windows local và cập nhật thật `.0` → `.1`.

`fa5063842ecb987137a4155c2a2941df04184e33` — **ci: publish Windows fork releases**

```text
.github/workflows/fork.yml
tests/fork-release-workflow.test.js
```

Kiểm chứng: test workflow, `npm run check`, workflow run thực tế và release `.2` đủ assets. Không có PR hay push vào repo gốc.

`cdf30140a4cb266de2116cd46191d811b12424da` — **fix: make media refresh resilient**

```text
electron/imageUtils.js
electron/ipc/media.js
src/App.jsx
src/components/detail/GameDetailPage.jsx
src/components/detail/GameDetailsWindow.jsx
src/components/detail/window/MediaTab.jsx
tests/media-db-helpers.test.js
tests/media-download-resilience.test.js
```

Kiểm chứng: regression test được chạy đỏ trước fix rồi xanh sau fix; focused tests PASS; `npm run check` PASS với 127 test files, 1.388 passed và 7 skipped. Chưa kiểm chứng installer/runtime của release chứa commit này tại thời điểm ghi dòng này.

## 6. Nhật ký đối chiếu lần sau

Thêm một dòng sau mỗi lần tích hợp; giữ các mốc cũ để truy vết.

| Ngày | Nightly tag / SHA | Fork SHA / release | Phạm vi tính năng | Check / runtime | Kết quả và vấn đề còn lại |
| --- | --- | --- | --- | --- | --- |
| 03/09/2026 | Baseline `cd8ad077`; thông báo đã ghi nhận `v0.9.9-nightly.494` | `fa50638` / `.2`; đang cài `.1 local` | Đã kiểm chứng theo mục 4 | Check PASS; runtime `.1` PASS | `.2` đã phát hành, chưa cài trong mốc này |
| 02/10/2026 | `v0.9.10-nightly.503` / `56ad0d4` | Local source sync; nền `0.9.10` | Giữ nguyên diff của 43 file tùy biến; regression PASS | `npm run check` PASS: 144 files, 1.548 passed, 7 skipped; renderer build PASS | Cherry-pick 9 first-parent deltas vào Fork; build và cài local từ commit tích hợp này. |
| 04/11/2026 | `0.9.15-nightly.518` / `464cdc0468f53d91a27b15f2d7ea6d97647ef262` | Merge commit chứa note này; parents `6f3bd03` + `464cdc0` | F01–F19 giữ hành vi; dùng các sửa Browse/delete/LC và modal của Nightly theo mục 7 | Check PASS: 197 files, 1.993 passed, 7 skipped; runtime chưa thử | PARTIAL ở mức bản cài; merge thường, không viết lại lịch sử đã push |

Khi thêm tùy biến: ghi mã F mới, hành vi cần giữ, file/test, commit và bằng chứng; không xóa mục cũ chỉ vì upstream thay cấu trúc file.

## 7. Đối chiếu tích hợp ngày 04/11/2026

### Quyết định giữ và dùng triển khai Nightly

| Vùng | Kết quả đối chiếu source/test |
| --- | --- |
| F01–F08: update, build, release và dữ liệu | Giữ các đường Fork, feed/manifest riêng, cảnh báo chuyển kênh và thông báo upstream độc lập. Nâng version nền theo Nightly lên `0.9.15`; không đổi dependency hay lockfile. |
| F09–F10, F14: media | Giữ deadline 30 giây, một request cho mỗi URL lỗi trong lượt xử lý, missing-only theo từng file, ảnh local và fallback; không thêm lượt tải khi promote. Dùng modal Nightly cho cảnh báo ảnh lỗi của Fork. |
| F11–F13, F16–F17: sort, collection, Details | Giữ sort độc lập, collection ẩn/creator folders, hydrate Wishlist metrics/ngày và Last Updated. Sửa Browse của Nightly chỉ áp dụng SQL Browse, không thay comparator hoặc sở thích sort riêng. |
| F15, F18–F19: launch, tray, cửa sổ | Giữ fallback UAC, báo lỗi launch, vòng đời tray, pause media và định tuyến đúng cửa sổ. |
| Browse ngày | Nhận triển khai Nightly: custom range có thể chỉ có một cận; index/union dùng cùng fallback ngày release/update/published khi lọc và sort. Test: `tests/browse-date-filter.test.js`. |
| Xóa game và orphan | Nhận cleanup/broadcast Nightly cho `downloads`, `collection_games`, `preview_sort`, `gog_mappings`, `media_source_cache`, làm mới install state của catalog; startup sweep/audit đi cùng. Test: `tests/delete-game-completely.test.js`, `tests/delete-game-broadcast.test.js`, `tests/orphan-sweep.test.js`. Chỉ thử trên fixture/database tạm. |
| LewdCorner tier | Nhận cấu hình site đi kèm release trong `electron/config/lcTier.json`; sanitizer bỏ các URL/selector cũ trong config người dùng. Giữ các tùy chọn hành vi như `lcThreadProbeEnabled` và cache tier. Test: `tests/lewdcorner-tier-detection.test.js`, `tests/config-sanitize-migration.test.js`; chưa đăng nhập/thử site thật. |
| Changelog | Giữ bố cục Stable/Nightly/Legacy mới của upstream. Chuyển đủ 11 entry riêng của Fork từ phần Unreleased cũ sang `NIGHTLY.CHANGELOG.md` → Fork — unreleased; không bỏ lịch sử tùy biến. |

### Bằng chứng và phần chưa kiểm tra

- **PASS — regression đỏ/xanh:** thêm `tests/detail-dialogs.test.jsx` trước khi sửa; cả hai test thất bại đúng lý do: cảnh báo media còn native-only và Esc rời trang dù modal xác nhận mở. Sau hai dòng sửa trong `GameDetailPage.jsx`, cả hai test đạt; nội dung/số lỗi của Fork vẫn hiển thị và có thể đóng bằng OK.
- **PASS — cài dependency:** `npm ci`, Node `v22.20.0`, npm `10.9.3`; lockfile không đổi. npm báo **42 dependency advisories (25 moderate, 15 high, 2 critical)** trên dependency hiện tại; chưa nâng/sửa dependency trong phạm vi sync.
- **PASS — full gate:** `npm run check`, exit 0: **197 test files, 1.993 tests passed, 7 skipped**, lint **0 errors / 68 warnings**, contract scripts và renderer build đạt. Hai regression mới nằm trong tổng này. Sau gate chỉ cập nhật tài liệu; đối chiếu lại `git diff --check` và `git diff --cached --check`, bỏ khoảng trắng cuối dòng tại 4 dòng của `LEGACY.CHANGELOG.md` mới nhận từ upstream để staged diff cũng đạt.
- **PASS — phạm vi giữ riêng:** 65 đường dẫn source/test/config khác Nightly nhưng không nằm trong thay đổi incoming vẫn nguyên nội dung so với fork trước merge. Các vùng giao nhau (`configSchema`, game IPC, main, Details, package) đã đọc diff riêng và giữ các nhánh tùy biến; đường dẫn source/test trong note đã kiểm tra tồn tại. Test và source không thay thế kiểm chứng runtime.
- **PARTIAL — runtime:** chưa build/cài Windows installer, chưa chạy app đã cài, chưa thử updater/UAC/tray/extension bằng app thật, chưa download/media qua CDN hoặc đăng nhập LC thật, chưa đối chiếu database cá nhân sau nâng cấp. Không sửa dữ liệu tại `D:\Tools\Atlas\data`; test tự động không chứng minh các luồng runtime này.
- `.codex/` có sẵn và các checkpoint/log trong `scratch/fork-sync-20261104/` nằm ngoài commit. Commit/push chỉ nhắm `origin/fork`, không tạo PR hay push upstream.
- AI assistance: **Codex (GPT-6)** giải quyết changelog, sửa hai dòng tích hợp UI, viết regression test và cập nhật note; code Nightly còn lại được merge từ lịch sử upstream. Người dùng vẫn cần kiểm tra runtime ở trên trước khi coi bản cài mới đã được xác nhận.
