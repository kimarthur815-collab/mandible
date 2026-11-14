# MANDIBLE

버려진 살충제 공장에서 거대한 벌레들을 피해 탈출하는 1인칭 3D 공포 게임.
방역업체 직원이 되어 발전기 3개를 켜고, 약 4분 안에 하역장 셔터로 빠져나가야 한다.

Three.js로 웹에서 바로 돌아가며, 폰(가로 화면)과 PC 모두 지원한다.

## 플레이

GitHub Pages를 켜면 아래 주소에서 바로 열린다.

| 페이지 | 주소 |
| --- | --- |
| 게임 맵 (현재 개발 중인 본편) | https://kimarthur815-collab.github.io/mandible/ |
| 바퀴벌레 미리보기 | https://kimarthur815-collab.github.io/mandible/roach.html |
| 지네 미리보기 | https://kimarthur815-collab.github.io/mandible/centipede.html |
| 거미 미리보기 | https://kimarthur815-collab.github.io/mandible/spider.html |

### 조작

**PC**: WASD 이동 · 마우스 시점 · 좌클릭 손전등 · Shift 달리기 · C 웅크리기 · E 상호작용(발전기는 꾹) · M 지도 · B 밝게 보기 · ` 개발자 모드

**폰**: 가로로 들고 플레이. 왼쪽 화면을 끌어 이동, 오른쪽 화면을 끌어 둘러보기. 바퀴가 몸에 붙으면 '털기!' 연타.

## 지금 들어간 것

- 맵 그레이박스: 하역장 → 창고 → 기계실 → 복도 → 생산 홀 → 실험실 → 비상 통로
- 발전기 3개, 전등(안전지대), 쪽지, 출구 셔터
- 바퀴 떼 4무리: 소리를 듣고 몰려오고, 빛을 보면 흩어지고, 몸에 붙으면 털어내야 함
- 개발자 모드: 방/벌레 위치 순간이동, 무적·벽 통과·벌레 멈춤 등
- 벌레 모델: 바퀴벌레(날기 포함), 그리마형 지네, 늑대거미·유령거미

## 아직 할 것

- 거미 두 마리, 지네, 새끼 거미, 거미줄을 맵에 넣기
- 소리, 난이도 조정, 클리어 시간 맞추기

## 폴더 구조

```
src/            게임 코드
  map/          맵, 플레이어, 바퀴 떼
  roach.js      바퀴벌레 모델·애니메이션
  centipede.js  지네
  spider.js     거미
  silk.js       거미줄, 알집
  textures.js   절차적 텍스처
templates/      각 페이지의 HTML 틀
docs/           빌드 결과 (GitHub Pages가 여기서 서비스)
build.mjs       src + templates → docs 로 묶는 스크립트
```

## 빌드

```
npm install
npm run build        # 모든 페이지
npm run build:map    # 게임 맵만
```

결과물은 `docs/` 에 하나짜리 HTML 파일로 나온다. 서버 없이 파일을 바로 열어도 동작한다.
