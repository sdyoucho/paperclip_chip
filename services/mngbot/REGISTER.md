# /api/mngbot/* 라우터 등록 방법

`mngbot-router.ts`(이 폴더에 있음)를 Paperclip 서버가 실제로 쓰게 하려면,
서버가 Express 앱을 만드는 곳에서 이 라우터를 한 번 호출해줘야 합니다.

## 어디를 수정하나

파일: **`server/src/app.ts`**

이 파일 안 어딘가에 Express 앱(`app`)을 만들고 라우트들을 붙이는 부분이 있습니다.
보통 이런 식으로 생겼어요(정확한 형태는 버전마다 다름):

```ts
const app = express();
app.use(express.json());
// ... 여기서 여러 라우트를 등록 ...
registerSomeRoutes(app);
registerOtherRoutes(app);
```

## 무엇을 추가하나

### 1) 파일 맨 위 import 구역에 한 줄 추가

```ts
import { registerMngbotRoutes } from "./services/mngbot/mngbot-router.js";
```
(경로 끝의 `.js`는 이 프로젝트 규칙상 필수입니다. 앞서 겪은 그 규칙과 동일.)

### 2) db(드리즐 인스턴스)를 구해서 라우터에 넘기기

`mngbot-router.ts`는 `registerMngbotRoutes(app, db)` 형태로, **app과 db 두 개**를
받습니다. app.ts 안에는 이미 db를 만드는/가진 코드가 있을 가능성이 높습니다.
아래 세 경우 중 하나로 처리하세요.

- **(A) app.ts에 이미 `db` 변수가 있으면** → 그대로 넘기기:
  ```ts
  registerMngbotRoutes(app, db);
  ```

- **(B) app.ts에서 다른 라우트들이 `req` 안의 db를 쓰거나, createDb를 부르는
  패턴이면** → client.ts의 createDb로 직접 만들어 넘기기:
  ```ts
  import { createDb } from "@paperclipai/db/client.js"; // 실제 패키지명/경로에 맞게
  const mngbotDb = createDb(process.env.DATABASE_URL!);
  registerMngbotRoutes(app, mngbotDb);
  ```

- **(C) 잘 모르겠으면** → 가장 안전한 (B) 방식을 쓰세요. createDb는 client.ts에
  실제로 export되어 있는 게 확인된 함수라, 어떤 경우든 동작합니다.

### 3) 위치

`app.use(express.json())` **다음**, 그리고 다른 라우트 등록들과 **같은 구역**에
넣으면 됩니다. 순서는 크게 중요치 않지만, `express.json()` 뒤여야 body를 읽을 수
있으니 그 뒤에 두세요.

## 인증 키 맞추기 (선택이지만 권장)

`mngbot-router.ts`는 `MNGBOT_API_KEY` 환경변수가 있으면 그 값으로 Bearer 인증을
합니다. 서비스들과 값을 맞춰야 통신이 됩니다:

- Paperclip 서비스(Railway)에 `MNGBOT_API_KEY` = (아무 긴 랜덤 문자열) 설정
- mngbot-runtime 서비스의 `PAPERCLIP_AGENT_API_KEY` = 같은 값
- discord-adapter 서비스의 `PAPERCLIP_DISCORD_ADAPTER_API_KEY` = 같은 값

`MNGBOT_API_KEY`를 아예 설정 안 하면 인증을 건너뜁니다(테스트용으로는 편하지만,
공개 배포라면 반드시 설정하세요).

## 확인 방법

배포 후, 브라우저나 도구로 아래를 열어보면 됩니다(회사 UUID 넣어서):
```
https://<railway-url>/api/mngbot/streamers?companyId=58054e46-9ab2-4f93-924b-216122587c7e
```
- `[]`(빈 배열) 또는 목록이 JSON으로 나오면 → 라우터 정상 등록됨
- `Cannot GET /api/mngbot/streamers` → app.ts 등록이 안 된 것. 위 2)를 다시 확인
- `401 unauthorized` → MNGBOT_API_KEY는 설정됐는데 Authorization 헤더 없이 열어서
  그런 것(정상). 서비스끼리는 키를 넣고 부르니 문제없음.
