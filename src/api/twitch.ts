import type { ClientCredentialsGrantFlow } from '../types.js';

const API_ENDPOINTS = {
  twitchAccessToken: 'https://id.twitch.tv/oauth2/token',
  twitchAccessTokenValidate: 'https://id.twitch.tv/oauth2/validate'
};

export class TwitchGlobalHandler {
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

async function getAndValidateTwitchAccessToken(twitchglobalhandler: Readonly<TwitchGlobalHandler>): Promise<void> {
  await twitchglobalhandler.getTwitchAccessToken();
  await twitchglobalhandler.validateTwitchAccessToken();
}

function logGotAccessToken(twitchglobalhandler: Readonly<TwitchGlobalHandler>): void {
  if (twitchglobalhandler.gotAccessToken()) console.log('Got Twitch Access Token.');
  else console.log('Failed to get Twitch Access Token.');
}
function logIsAccessTokenValidated(twitchglobalhandler: Readonly<TwitchGlobalHandler>): void {
  if (twitchglobalhandler.isAccessTokenValidated()) console.log('Twitch Access Token is valid.');
  else console.log('Twitch Access Token is invalid.');

  return;
}

export async function validationHandler(twitchGlobalHandler: Readonly<TwitchGlobalHandler>): Promise<void> {
  await twitchGlobalHandler.validateTwitchAccessToken();
  logIsAccessTokenValidated(twitchGlobalHandler);

  if (!twitchGlobalHandler.isAccessTokenValidated()) {
    await getAndValidateTwitchAccessToken(twitchGlobalHandler);
    logGotAccessToken(twitchGlobalHandler);
    logIsAccessTokenValidated(twitchGlobalHandler);
  }
}

export async function createTwitchApi(
  twitchClientId: string,
  twitchSecret: string
): Promise<Readonly<TwitchGlobalHandler>> {
  const twitchGlobalHandler: Readonly<TwitchGlobalHandler> = new TwitchGlobalHandler(twitchClientId, twitchSecret);
  await validationHandler(twitchGlobalHandler);

  return twitchGlobalHandler;
}
