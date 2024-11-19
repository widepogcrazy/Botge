import { scheduleJob } from 'node-schedule';

const API_ENDPOINTS = {
  twitchAccessToken: 'https://id.twitch.tv/oauth2/token',
  twitchAccessTokenValidate: 'https://id.twitch.tv/oauth2/validate'
};

interface ClientCredentialsGrantFlow {
  readonly access_token: string;
  readonly expires_in: number;
  readonly token_type: string;
}

export interface ITwitchGlobalHandler {
  readonly gotAccessToken: () => boolean;
  readonly isAccessTokenValidated: () => boolean;
  readonly getTwitchAccessToken: () => Promise<void>;
  readonly validateTwitchAccessToken: () => Promise<void>;
  readonly getTwitchGlobalOptions: () =>
    | {
        readonly method: string;
        readonly headers: {
          readonly Authorization: string;
          readonly 'Client-Id': string;
        };
      }
    | undefined;
}

export class TwitchGlobalHandler implements ITwitchGlobalHandler {
  private readonly _twitchClientId: string;
  private readonly _twitchSecret: string;

  private _accessToken: string | undefined = undefined;
  private _accessTokenStatus: number | undefined = undefined;
  private _accessTokenValidationStatus: number | undefined = undefined;

  public constructor(twitchClientId: string, twitchSecret: string) {
    this._twitchClientId = twitchClientId;
    this._twitchSecret = twitchSecret;
  }

  public gotAccessToken(): boolean {
    return this._accessTokenStatus === 200;
  }
  public isAccessTokenValidated(): boolean {
    return this.gotAccessToken() && this._accessTokenValidationStatus === 200;
  }

  public async getTwitchAccessToken(): Promise<void> {
    const twitchAccessToken = await fetch(API_ENDPOINTS.twitchAccessToken, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `client_id=${this._twitchClientId}&client_secret=${this._twitchSecret}&grant_type=client_credentials`
    });

    this._accessToken = ((await twitchAccessToken.json()) as ClientCredentialsGrantFlow).access_token;
    this._accessTokenStatus = twitchAccessToken.status;
  }

  public async validateTwitchAccessToken(): Promise<void> {
    if (!this.gotAccessToken()) {
      return;
    }

    const twitchAccessTokenValidation = await fetch(API_ENDPOINTS.twitchAccessTokenValidate, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this._accessToken}`
      }
    });

    this._accessTokenValidationStatus = twitchAccessTokenValidation.status;
  }

  public getTwitchGlobalOptions():
    | {
        readonly method: string;
        readonly headers: {
          readonly Authorization: string;
          readonly 'Client-Id': string;
        };
      }
    | undefined {
    if (!this.gotAccessToken() || !this.isAccessTokenValidated()) {
      return undefined;
    }

    const optionsTwitchGlobal = {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this._accessToken}`,
        'Client-Id': this._twitchClientId
      }
    };

    return optionsTwitchGlobal;
  }
}

async function getAndValidateTwitchAccessToken(twitchglobalhandler: ITwitchGlobalHandler): Promise<void> {
  await twitchglobalhandler.getTwitchAccessToken();
  await twitchglobalhandler.validateTwitchAccessToken();
}

function logGotAccessToken(twitchglobalhandler: ITwitchGlobalHandler): void {
  if (twitchglobalhandler.gotAccessToken()) console.log('Got Twitch Access Token.');
  else console.log('Failed to get Twitch Access Token.');
}
function logIsAccessTokenValidated(twitchglobalhandler: ITwitchGlobalHandler): void {
  if (twitchglobalhandler.isAccessTokenValidated()) console.log('Twitch Access Token is valid.');
  else console.log('Twitch Access Token is invalid.');

  return;
}

export async function createTwitchApi(twitchClientId: string, twitchSecret: string): Promise<TwitchGlobalHandler> {
  const twitch = new TwitchGlobalHandler(twitchClientId, twitchSecret);
  await twitch.validateTwitchAccessToken();
  logIsAccessTokenValidated(twitch);
  if (!twitch.isAccessTokenValidated()) {
    await getAndValidateTwitchAccessToken(twitch);
    logGotAccessToken(twitch);
    logIsAccessTokenValidated(twitch);
  }

  // start background validation thread.
  scheduleJob('*/60 * * * *', async () => {
    await twitch.validateTwitchAccessToken();
    logIsAccessTokenValidated(twitch);
    if (!twitch.isAccessTokenValidated()) {
      await getAndValidateTwitchAccessToken(twitch);
      logGotAccessToken(twitch);
      logIsAccessTokenValidated(twitch);
    }
  });
  return twitch;
}
