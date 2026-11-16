# 쿠팡 가격비교 배너 (2026-10-25)

홈 캐러셀의 기존 3개 배너 뒤에 네 번째 배너를 추가했다. 2초 자동 전환, 손가락 넘기기, 배너 개수에 따른 점 표시 기능은 기존 캐러셀을 사용한다.

이미지는 기본 이미지 생성 도구로 제작했다. 원본은 `assets/banner-originals/coupang-price-compare-2026.png` (2172×724). 배포본은 `assets/home/coupang-price-compare-optimized-v1-{480,768,1536,2172}.{avif,webp}`. 원본 PNG는 웹 배포에 포함하지 않는다.

제작 프롬프트의 핵심: 3:1 가로형, 코발트·네이비 배경, 왼쪽에 큰 한글 문구 "PX 살 때," / "쿠팡 가격도 비교!", 버튼 "쿠팡 바로가기 →", 오른쪽에 쇼핑 스마트폰·쇼핑백·돋보기와 PX/쿠팡 비교 태그. 실제 가격·할인율·최저가·공식 제휴 주장을 넣지 않는다.

기본 링크는 https://www.coupang.com/ 이며 아이폰에서는 Universal Link로 동작한다. Apple이 제공하는 공식 연결정보(https://app-site-association.cdn-apple.com/a/v1/www.coupang.com)에서 `/` 경로와 `com.coupang.Coupang` 앱 연결을 확인했다.

안드로이드는 사용자가 누르는 링크를 HTTPS Android Intent로 설정하며 `com.coupang.mobile` 앱을 대상으로 한다. 앱 실행이 지원되지 않으면 `browser_fallback_url`로 쿠팡 웹을 연다. 앱 실행은 기기·브라우저 설정의 영향을 받으며 이 환경에서 실제 휴대폰 앱 전환을 직접 확인할 수는 없다. 페이지 로드·자동 슬라이드·스와이프만으로 외부 앱을 실행하지 않는다.

근거: https://developer.chrome.com/docs/android/intents 및 https://play.google.com/store/apps/details?id=com.coupang.mobile . 제휴 광고 식별자는 설정하지 않았다.
