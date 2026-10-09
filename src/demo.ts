import type { Entry } from "./domain";
const common = {
  visibility: "public",
  display_name: "架空の案内人",
  media: [],
  lat: 35.681,
  lng: 139.767,
};
export const demoRecords: Entry[] = [
  {
    ...common,
    id: "r1",
    place_name: "まちの赤レンガ駅",
    title: "駅舎が語る街の歴史",
    description:
      "【架空の専門家解説】駅を中心に人と文化が集まり、街が発展しました。実際の歴史資料ではありません。",
    category: "専門家解説",
    media: [
      {
        url: import.meta.env.BASE_URL + "demo-town.svg",
        kind: "photo",
        name: "架空の街のイラスト",
      },
    ],
  },
  {
    ...common,
    id: "r2",
    lat: 35.685,
    lng: 139.77,
    place_name: "交流広場",
    title: "広場で聞いた思い出",
    description:
      "【架空の住民インタビュー】昔はこの広場で夏祭りを楽しみました。掲載同意確認済みのデモです。",
    category: "住民インタビュー",
    consent: true,
  },
  {
    ...common,
    id: "r3",
    lat: 35.678,
    lng: 139.763,
    place_name: "緑の小道",
    title: "朝の小道の観察",
    description:
      "【架空の観察記録】並木の下に小さな花を見つけました。音声は合成したデモ音です。",
    category: "観察記録",
    media: [
      {
        url: import.meta.env.BASE_URL + "demo-tone.wav",
        kind: "audio",
        name: "デモ音声",
      },
    ],
  },
];
export const demoRequests: Entry[] = [
  {
    ...common,
    id: "h1",
    lat: 35.68,
    lng: 139.77,
    title: "買い物の荷物運びを手伝ってください",
    description:
      "【架空の依頼】商店街から地域の集会所まで、軽い荷物を一緒に運んでくださる方を募集します。",
    area: "中央地域（架空）",
    category: "買い物・荷物運び",
    status: "募集中",
    desired_at: "土曜日 午前",
    frequency: "単発",
    reward: "無償",
  },
  {
    ...common,
    id: "h2",
    lat: 35.69,
    lng: 139.76,
    title: "スマホで写真を送る方法を知りたい",
    description: "【架空の依頼】地域の交流会で、写真の送り方を教えてください。",
    area: "北地域（架空）",
    category: "スマートフォン・デジタル支援",
    status: "募集中",
    desired_at: "平日 午後",
    frequency: "継続",
    reward: "応相談",
  },
];
