/**
 * 데모 모드용 axios 어댑터.
 * 백엔드 서비스가 종료되어, VITE_DEMO_MODE=true 일 때 모든 API 요청을
 * 네트워크 대신 이 파일의 가짜 응답으로 처리합니다.
 */
import type {
  AxiosAdapter,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import type { LocationListResponse } from '@/api/services/map/map.type';
import type { ScanClassifyResponse } from '@/api/services/scan/scan.type';

export const IS_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

const STORAGE_KEY = 'eco2-demo-state';

type DemoState = {
  nickname: string;
  phone_number: string | null;
  characters: string[];
  scanCount: number;
};

const defaultState: DemoState = {
  nickname: '이코친구',
  phone_number: null,
  characters: ['이코'],
  scanCount: 0,
};

const loadState = (): DemoState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultState, ...JSON.parse(raw) };
  } catch {
    /* 저장소 접근 불가 시 기본값 사용 */
  }
  return { ...defaultState };
};

const saveState = (state: DemoState) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* 무시 */
  }
};

// 스캔 결과로 순서대로 보여줄 품목들
const SCAN_SAMPLES: {
  major: string;
  middle: string;
  minor: string;
  character: string;
  steps: Record<string, string>;
  answer: string;
}[] = [
  {
    major: '재활용폐기물',
    middle: '무색페트병',
    minor: '음료 페트병',
    character: '페티',
    steps: {
      step1: '내용물을 비우고 물로 깨끗이 헹궈요.',
      step2: '라벨을 떼어내요.',
      step3: '찌그러뜨린 뒤 뚜껑을 닫아 투명 페트병 전용 수거함에 배출해요.',
    },
    answer: '투명 페트병이네요! 라벨을 떼고 헹궈서 전용 수거함에 넣어주세요.',
  },
  {
    major: '재활용폐기물',
    middle: '종이',
    minor: '과자상자',
    character: '페이피',
    steps: {
      step1: '테이프와 스테이플을 제거해요.',
      step2: '비닐 코팅된 부분이 있다면 떼어내요.',
      step3: '납작하게 펴서 묶은 뒤 종이류로 배출해요.',
    },
    answer: '종이 상자예요. 테이프를 떼고 납작하게 접어서 배출해 주세요.',
  },
  {
    major: '재활용폐기물',
    middle: '유리병',
    minor: '음료수병',
    character: '글래시',
    steps: {
      step1: '뚜껑을 분리해요.',
      step2: '내용물을 비우고 헹궈요.',
      step3: '깨지지 않게 유리병 수거함에 배출해요.',
    },
    answer: '유리병이에요. 뚜껑을 분리하고 헹궈서 배출해 주세요.',
  },
  {
    major: '재활용폐기물',
    middle: '금속류',
    minor: '음료 캔',
    character: '메탈리',
    steps: {
      step1: '내용물을 비우고 헹궈요.',
      step2: '가능하면 납작하게 눌러요.',
      step3: '캔류 수거함에 배출해요.',
    },
    answer: '음료 캔이네요. 헹군 뒤 눌러서 캔류로 배출해 주세요.',
  },
];

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const makeLocations = (lat: number, lon: number): LocationListResponse => {
  const base = [
    { name: '이코 무인회수기 1호점', source: 'keco', dLat: 0.002, dLon: 0.001 },
    { name: '제로웨이스트 리필샵', source: 'zerowaste', dLat: -0.0015, dLon: 0.002 },
    { name: '이코 무인회수기 2호점', source: 'keco', dLat: 0.001, dLon: -0.0025 },
    { name: '알맹 리필스테이션', source: 'zerowaste', dLat: -0.003, dLon: -0.001 },
    { name: '이코 무인회수기 3호점', source: 'keco', dLat: 0.0035, dLon: 0.003 },
  ] as const;

  return base.map((b, i) => {
    const km = Math.round(Math.hypot(b.dLat, b.dLon) * 111 * 10) / 10;
    return {
      id: i + 1,
      name: b.name,
      source: b.source,
      road_address: '서울특별시 관악구 관악로 1 (데모 주소)',
      latitude: lat + b.dLat,
      longitude: lon + b.dLon,
      distance_km: km,
      distance_text: `${km}km`,
      is_open: true,
      is_holiday: false,
      start_time: '09:00',
      end_time: '18:00',
      phone: '02-000-0000',
      pickup_categories:
        b.source === 'keco' ? ['clear_pet', 'can', 'paper'] : undefined,
    };
  });
};

const parseBody = (data: unknown) => {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
  return data ?? {};
};

const handle = async (
  method: string,
  path: string,
  config: InternalAxiosRequestConfig,
): Promise<{ status: number; data: unknown }> => {
  const state = loadState();
  const body = parseBody(config.data);

  // 인증: 소셜 로그인 버튼 → 바로 홈으로 이동
  if (/^\/api\/v1\/auth\/(kakao|google|naver)$/.test(path)) {
    return {
      status: 200,
      data: { data: { authorization_url: `${window.location.origin}/#/home` } },
    };
  }
  if (path.startsWith('/api/v1/auth/')) return { status: 200, data: {} };

  // 사용자
  if (path === '/api/v1/user/me') {
    if (method === 'patch') {
      Object.assign(state, body);
      saveState(state);
    }
    return {
      status: 200,
      data: {
        nickname: state.nickname,
        username: 'demo-user',
        phone_number: state.phone_number,
        provider: 'demo',
      },
    };
  }
  if (path === '/api/v1/user/me/characters') {
    return {
      status: 200,
      data: state.characters.map((name, i) => ({
        id: String(i),
        code: name,
        name,
        type: i === 0 ? 'main' : 'sub',
        dialog: '',
        acquired_at: new Date().toISOString(),
      })),
    };
  }

  // 이미지 업로드 (presigned URL 흉내)
  if (/^\/api\/v1\/images\//.test(path)) {
    return {
      status: 200,
      data: {
        key: 'demo',
        upload_url: 'demo://upload',
        cdn_url: `demo://image/${Date.now()}`,
        expires_in: 3600,
        required_headers: {},
      },
    };
  }
  if (path === 'demo://upload') return { status: 200, data: {} };

  // 스캔
  if (path === '/api/v1/scan/classify') {
    await delay(800);
    const sample = SCAN_SAMPLES[state.scanCount % SCAN_SAMPLES.length];
    const alreadyOwned = state.characters.includes(sample.character);
    state.scanCount += 1;
    if (!alreadyOwned) state.characters.push(sample.character);
    saveState(state);

    const result: ScanClassifyResponse = {
      task_id: `demo-${state.scanCount}`,
      status: 'completed',
      message: 'ok',
      pipeline_result: {
        classification_result: {
          classification: {
            major_category: sample.major,
            middle_category: sample.middle,
            minor_category: sample.minor,
          },
        },
        disposal_rules: { key: sample.middle, category: sample.middle },
        final_answer: {
          disposal_steps: sample.steps,
          insufficiencies: [],
          user_answer: sample.answer,
        },
      },
      reward: {
        received: alreadyOwned ? '' : sample.character,
        already_owned: alreadyOwned,
        name: sample.character,
        dialog: `${sample.character}를 만났어요!`,
        match_reason: sample.middle,
      },
    };
    return { status: 200, data: result };
  }
  if (path.startsWith('/api/v1/scan/')) return { status: 200, data: [] };

  // 지도
  if (path === '/api/v1/locations/centers') {
    const lat = Number(config.params?.lat) || 37.4784;
    const lon = Number(config.params?.lon) || 126.9516;
    return { status: 200, data: makeLocations(lat, lon) };
  }

  // 채팅
  if (path === '/api/v1/chat/messages') {
    await delay(700);
    return {
      status: 200,
      data: {
        session_id: body.session_id || 'demo-session',
        user_answer:
          '지금은 데모 모드라서 실제 AI 답변 대신 예시 답변을 보여드려요. ' +
          '페트병은 라벨을 떼고 헹군 뒤 찌그러뜨려 투명 페트병 수거함에 버려주세요!',
      },
    };
  }

  return { status: 404, data: { message: `demo: ${method} ${path} 없음` } };
};

export const demoAdapter: AxiosAdapter = async (config) => {
  const method = (config.method ?? 'get').toLowerCase();
  const url = config.url ?? '';
  const path = url.startsWith('demo://')
    ? url.replace(/^demo:\/\/image\/.*/, 'demo://image')
    : new URL(url, 'http://demo').pathname;

  const { status, data } = await handle(method, path, config);

  const response: AxiosResponse = {
    data,
    status,
    statusText: status === 200 ? 'OK' : 'Not Found',
    headers: {},
    config,
    request: {},
  };
  if (status >= 400) {
    return Promise.reject(
      Object.assign(new Error(`Demo ${status}`), { response, config }),
    );
  }
  return response;
};
