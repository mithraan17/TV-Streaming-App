export type Provider = {
  id: string;
  name: string;
  isMock: boolean;
};

export type Show = {
  name: string;
  url: string;
  imageUrl: string;
};

export type Episode = {
  title: string;
  date: string;
  episodeUrl: string;
};

export type RootStackParamList = {
  Provider: undefined;
  Show: { provider: Provider };
  Episode: { provider: Provider; show: Show };
  Player: { videoUrl: string };
  Error: { message: string; retryRoute: keyof RootStackParamList; retryParams?: object };
};
