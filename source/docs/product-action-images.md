# 상품 선택 이미지 버튼

2026-10-25: 상품 팝업의 세 링크를 실제 생성 이미지로 교체. 이미지 전체가 하나의 접근 가능한 링크이며 alt와 aria-label을 함께 제공한다. 원본 assets/product-actions/originals, 표시용 WebP는 assets/product-actions (480/960px, 약8–22KB). 빌드 시 images/product-actions로 복사하며 원본 PNG는 공개하지 않는다.

Built-in image_gen으로 각각 생성. 공통 프롬프트: PX 가이드 모바일 쇼핑앱용 3:1 가로 이미지 버튼, 파란색 계열 프리미엄3D UI, 왼쪽 작은 아이콘/오른쪽 큰 흰색 한글 한 줄, 부제/가격/워터마크 없음. 정확한 문구: 쿠팡에서 가격 검색 / 동일 상품군 비교 / 상품 상세페이지 가기. 모티프: 쇼핑백+돋보기(로열블루), 제품 카드3개+화살표(청록), 정보 카드+상자+진행화살표(네이비).

쿠팡 버튼은 상품명 검색 URL을 유지한다. Android: com.coupang.mobile 대상으로 HTTPS intent + 동일 검색 URL browser_fallback_url. iOS: 공식 Universal Link인 https://www.coupang.com/np/search?q=… 직접 앵커. 팝업 window.open과 비동기 자동 리디렉션을 제거해 직접 탭의 사용자 동작을 유지한다. 실제 앱 실행은 설치/브라우저/OS 설정에 따라 달라질 수 있으며 물리적 iPhone/Android 기기에서는 미검증.

근거: https://developer.chrome.com/docs/android/intents , https://developer.apple.com/documentation/xcode/allowing-apps-and-websites-to-link-to-your-content . Apple 공식 association CDN https://app-site-association.cdn-apple.com/a/v1/www.coupang.com 에 두 Coupang appID와 /np/search 경로 포함 확인.

동일 상품군 비교는 기존 group 검색을 제거하고 현재 productSubcategory 및 category를 쿼리로 전달한다. 소분류/분류가 같은 상품만 기존 목록 필터에 의해 표시한다. 상품 DB는 변경하지 않는다.

모든 www.coupang.com HTTPS 앵커(동적 추가 포함)에 같은 앱 우선 연결을 적용한다. 외부 팝업 target을 제거하고 실제 클릭 기본 동작으로 연결하며 타이머 기반 웹 이동은 사용하지 않는다. 앱 설치 여부를 웹사이트에서 확정하거나 사용자 OS 설정을 강제로 변경할 수 없으므로, 브라우저가 앱 실행을 차단한 경우에도 웹 대체가 발생할 수 있다.
