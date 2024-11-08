const api_endpoints = {
  twitchAccessToken: 'https://id.twitch.tv/oauth2/token',
  twitchAccessTokenValidate: 'https://id.twitch.tv/oauth2/validate'
};

export class TwitchGlobalHandler {
  private twitch_client_id: string;
  private twitch_secret: string;

  private access_token: string;
  private access_token_status: number;
  private access_token_validation_status: number;

  private static _instance: TwitchGlobalHandler;

  private constructor(twitch_client_id: string, twitch_secret: string) {
    this.twitch_client_id = twitch_client_id;
    this.twitch_secret = twitch_secret;
  }

  static getInstance(twitch_client_id: string, twitch_secret: string): TwitchGlobalHandler {
    if (this._instance) {
      return this._instance;
    }
    this._instance = new TwitchGlobalHandler(twitch_client_id, twitch_secret);
    return this._instance;
  }

  gotAccessToken(): boolean {
    return this.access_token_status === 200;
  }
  isAccessTokenValidated(): boolean {
    return this.gotAccessToken() && this.access_token_validation_status === 200;
  }

  async getTwitchAccessToken() {
    const twitchAccessToken = fetch(api_endpoints.twitchAccessToken, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `client_id=${this.twitch_client_id}&client_secret=${this.twitch_secret}&grant_type=client_credentials`
    });
    this.access_token = String((await (await twitchAccessToken).json()).access_token);
    this.access_token_status = (await twitchAccessToken).status;
  }

  async validateTwitchAccessToken() {
    if (!this.gotAccessToken()) {
      return;
    }
    const twitchAccessTokenValidation = fetch(api_endpoints.twitchAccessTokenValidate, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.access_token}`
      }
    });
    this.access_token_validation_status = (await twitchAccessTokenValidation).status;
  }

  getTwitchGlobalOptions():
    | {
        method: string;
        headers: {
          Authorization: string;
          'Client-Id': string;
        };
      }
    | undefined {
    if (!this.gotAccessToken() || !this.isAccessTokenValidated()) {
      return undefined;
    }
    const optionsTwitchGlobal = {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.access_token}`,
        'Client-Id': this.twitch_client_id
      }
    };
    return optionsTwitchGlobal;
  }
}
