import axios from 'axios';
import fs from 'fs'; // saves file to root.
import {currentESTDatetime} from '../util';


interface fullTokenResponse {
  access_token: string;
  refresh_token: string;
  id_token: string;
  token_type: string;
  scope: string;
  timeStamp: number;
  expires_in: number;
}

interface rawAuthTokenResponse {
    access_token: string;
    refresh_token: string;
    id_token: string;
    token_type: string;
    scope: string;
    expires_in: number;
  }

interface rawRefreshTokenResponse {
    access_token: string;
    id_token: string;
    token_type: string;
    scope: string;
    expires_in: number;
}

const TOKEN_FILE_NAME = 'tsToken.json';
export const CALLBACK_URL = 'http://localhost:3001';
const API_URL = 'https://api.tradestation.com';
const SINGIN_URL = 'https://signin.tradestation.com/';
const TOKEN_URL = `${SINGIN_URL}oauth/token`;
const API_KEY = process.env.TS_CLIENT_ID;
const SECRET_KEY = process.env.TS_CLIENT_SECRET;

export const GET_AUTH_URL = () => {
  const scope = "openid offline_access profile MarketData ReadAccount Trade";
  const encodedScope = scope;//encodeURIComponent(scope);
  const encodedRedirectUrl = CALLBACK_URL;//encodeURIComponent(CALLBACK_URL);
  const encodedApiUrl = API_URL;//encodeURIComponent(API_URL);

  return `${SINGIN_URL}authorize?response_type=code&client_id=${API_KEY}&redirect_uri=${encodedRedirectUrl}&audience=${encodedApiUrl}&scope=${encodedScope}`;
}

export async function getNewAccessToken(){
  try {
    console.log(`${currentESTDatetime()} [INFO] - Refreshing Tradestation Token.`);
    const tokenDataFromStore = await readTokenResponseFromJSONFile(TOKEN_FILE_NAME);
    if (typeof tokenDataFromStore?.refresh_token !== 'undefined') {
      const newData = await getTokenFromRefresh(tokenDataFromStore?.refresh_token);
      const success : boolean = await updateTSTokenData(newData);
      console.log(`${currentESTDatetime()} [INFO] - Token Refreshed ${success ? 'Successfully!' : 'Un-successfully.'}.`);
    }else{
      console.error(`${currentESTDatetime()} [ERROR] triggerRefresh() - refresh_token is undefined.`);
    }
    const tokenObj = await readTokenResponseFromJSONFile(TOKEN_FILE_NAME);
    return tokenObj;
  } catch (error) {
    console.error(`${currentESTDatetime()} [ERROR] getNewAccessToken() - ${error}`);
      const tokenObj = await readTokenResponseFromJSONFile(TOKEN_FILE_NAME);
      return tokenObj;
  }
}

export async function triggerRefresh() {
    try {
        if (isTokenExpired()) {
            return await getNewAccessToken();
        } else {
              const tokenObj = await readTokenResponseFromJSONFile(TOKEN_FILE_NAME);
              return tokenObj;
        }
    } catch (error) {
          console.error(`${currentESTDatetime()} [ERROR] triggerRefresh() - ${error}`);
          const tokenObj = await readTokenResponseFromJSONFile(TOKEN_FILE_NAME);
          return tokenObj;
    }
  }

export async function getTokenFromAuthCode(authorizationCode:string):Promise<rawAuthTokenResponse>{
try {
    const response = await axios.post(TOKEN_URL, {
        grant_type: 'authorization_code',
        client_id: API_KEY,
        client_secret: SECRET_KEY,
        code: authorizationCode,
        redirect_uri: CALLBACK_URL,
    },{
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    return response.data;
} catch (error) {
    console.error(`${currentESTDatetime()} [ERROR] getTokenFromAuthCode() - ${error}`);
    throw error;
}
}

export async function getTokenFromRefresh(refresh_token:string) : Promise<rawRefreshTokenResponse> {
    // Refresh tokens are valid forever *unless otherwise noted.
    try {
        const response = await axios.post(TOKEN_URL, {
              grant_type: 'refresh_token',
              client_id: API_KEY,
              client_secret: SECRET_KEY,
              refresh_token: refresh_token,
          },{
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
          }
        });

      return response.data;
    } catch (error) {
      console.error(`${currentESTDatetime()} [ERROR] getTokenFromRefresh() - ${error}`);
      throw error;
    }
  }

function getCodeFromURL(url: String){
  var code = null;
  if (url.indexOf("code") !== -1){
    const spl =url.split("?code=");
    return spl[spl.length-1].split("&")[0];
  }
  return code;
}

export async function getAuthCode(fullUrl: string) {
    try {
        const authCode = getCodeFromURL(fullUrl);
        const resp = await getTokenFromAuthCode(authCode);
        insertTSTokenData(resp);
    } catch (error) {
      console.error(`${currentESTDatetime()} [ERROR] getAuthCode() - ${error}`);
    }
}

export function writeTokenResponseToJSONFile(data: rawAuthTokenResponse, fileName: string): boolean {
  try {
    fs.writeFileSync(fileName, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error(`${currentESTDatetime()} [ERROR] writeTokenResponseToJSONFile() - ${error}`);
    return false;
  }
}

export function readTokenResponseFromJSONFile(fileName: string): rawAuthTokenResponse | null {
  try {
    const data = fs.readFileSync(fileName, 'utf-8');
    const parsedData = JSON.parse(data);
    return parsedData;
  } catch (error) {
    console.error(`${currentESTDatetime()} [ERROR] readTokenResponseFromJSONFile() - ${error}`);
    return null;
  }
}

export function insertTSTokenData(data:rawAuthTokenResponse): boolean {
  try {
      if (typeof data?.timeStamp === 'undefined') {
          (data as any).timeStamp = Date.now();
      }
      return writeTokenResponseToJSONFile(data, TOKEN_FILE_NAME);
  } catch (error) {
    console.error(`${currentESTDatetime()} [ERROR] insertTSTokenData() - ${error}`);
      return false;
  }
}

export function isTokenExpired(): boolean {
  var obj = readTokenResponseFromJSONFile(TOKEN_FILE_NAME);
  if (obj != null) {
      var token_ts = obj?.timeStamp;
      if (typeof token_ts === 'undefined') {
          return false;
      } else {
          // if timedelta for the timestamp is > than 15 minutes its expired, this is called every 10seconds
          return (Date.now() - token_ts) / 1000 / 60 > 15 ? true : false;
      }
  } else {
      return false;
  }
}

export function updateTSTokenData(refreshTokenData: rawRefreshTokenResponse): boolean{
  const tokenDataFromStore = readTokenResponseFromJSONFile(TOKEN_FILE_NAME);
  if (tokenDataFromStore === null) {
      console.error(`${currentESTDatetime()} [ERROR] updateTSTokenData() - Need AuthCode & Refresh Token`);
      return false;
  } else {
      try {
          const updatedObject: fullTokenResponse = {
              access_token: refreshTokenData.access_token,
              refresh_token: tokenDataFromStore.refresh_token,
              id_token: refreshTokenData.id_token,
              token_type: refreshTokenData.token_type,
              scope: tokenDataFromStore.scope,
              timeStamp: Date.now(),
              expires_in: refreshTokenData.expires_in
          };
          return writeTokenResponseToJSONFile(updatedObject, TOKEN_FILE_NAME);
      } catch (error) {
          return false;
      }
    return false;
  }
}


export class TSAuthentication {
  tokenFile: string;
  callBackUrl: string;
  apiUrl: string;
  signInUrl: string;
  tokenUrl: string;
  apiKey: string | undefined;
  secretKey: string | undefined;
  tradingScope: string;

  constructor(){
    this.tokenFile = 'tsToken.json';
    this.callBackUrl = 'http://localhost:3001';
    this.apiUrl = 'https://api.tradestation.com';
    this.signInUrl = 'https://signin.tradestation.com/';
    this.tokenUrl = `${this.signInUrl}oauth/token`;
    this.apiKey = process.env?.TS_CLIENT_ID || undefined;
    this.secretKey = process.env?.TS_CLIENT_SECRET || undefined;
    this.tradingScope = "openid offline_access profile MarketData ReadAccount Trade";
  }

  info(msg:any){
    console.log(`${currentESTDatetime()} [INFO] ${msg}`);
  }

  error(msg:any){
    console.error(`${currentESTDatetime()} [ERROR] ${msg}`);
  }

  /*
    A space-separated list of scopes (case sensitive).
    openid scope is always required. offline_access is
    required for Refresh Tokens.
      Example: openid profile offline_access MarketData ReadAccount Trade Crypto
    See Scopes for more information.
    https://api.tradestation.com/docs/fundamentals/authentication/scopes
  */
  getAuthUrl(){
      // the encodeURI works, I was testing and never uncommented them out.
      const encodedScope = this.tradingScope;//encodeURIComponent(this.tradingScope);
      const encodedRedirectUrl = this.callBackUrl;//encodeURIComponent(this.callBackUrl);
      const encodedApiUrl = this.apiUrl;//encodeURIComponent(this.apiUrl);
      return `${this.signInUrl}authorize?response_type=code&client_id=${this.apiKey}&redirect_uri=${encodedRedirectUrl}&audience=${encodedApiUrl}&scope=${encodedScope}`;
    }

  /**
    Retrieves a new access token by refreshing the Tradestation token.
    If a refresh token is available, it obtains a new token and updates the token data.
    Logs the token refresh status and returns the token object.
    If an error occurs, logs the error and returns the token object.
    @returns {Promise<object>} The token object.
  */
  async getNewAccessToken(){
    try {
      this.info(`Refreshing Tradestation Token.`);
      const tokenData = await this.readTSTokenFile(this.tokenFile);
      if (typeof tokenData?.refresh_token !== 'undefined') {
        const newTokenData = await this.getTokenFromRefresh(tokenData?.refresh_token);
        const success : boolean = await this.updateTSTokenData(newTokenData);
        this.info(`Token Refreshed ${success ? 'Successfully!' : 'Un-successfully.'}.`);
      }else{
        this.error(`triggerRefresh() - refresh_token is undefined.`);
      }
      const tokenObj = await this.readTSTokenFile(this.tokenFile);
      return tokenObj;
    } catch (error) {
        this.error(`getNewAccessToken() - ${error}`);
        const tokenObj = await this.readTSTokenFile(this.tokenFile);
        return tokenObj;
    }
  }

  /**
   * This function is used to get a new access token using a refresh token.
   *  It takes in a refresh token as a parameter and returns a Promise that
   * resolves to a rawRefreshTokenResponse object.
   */
  async getTokenFromRefresh(refresh_token:string) : Promise<rawRefreshTokenResponse> {
    // Refresh tokens are valid forever *unless otherwise noted.
    try {
        const response = await axios.post(this.tokenUrl, {
              grant_type: 'refresh_token',
              client_id: this.apiKey,
              client_secret: this.secretKey,
              refresh_token: refresh_token,
          },{
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
          }
        });
      return response.data;
    } catch (error) {
      this.error(`getTokenFromRefresh() - ${error}`);
      throw error;
    }
  }

  /**
    triggers a refresh of the access token.
    It checks if the token is expired and either retrieves
    a new access token or returns the existing token object.
    @returns {token<object>}
  */
  async triggerRefresh() {
    try {
        if (this.isTokenExpired()) {
            return await this.getNewAccessToken();
        } else {
            const tokenData = await this.readTSTokenFile(this.tokenFile);
            return tokenData;
        }
    } catch (error) {
          this.error(`triggerRefresh() - ${error}`);
          const tokenData = await this.readTSTokenFile(this.tokenFile);
          return tokenData;
    }
  }

  /**
    Retrieves an access token from an authorization code.
    @param {string} authorizationCode - The authorization code obtained from the user.
    @returns {Promise<rawAuthTokenResponse>} - A promise that resolves with the raw access token response.
    @throws {Error} - If there is an error while retrieving the access token.
  */
  async getTokenFromAuthCode(authorizationCode:string):Promise<rawAuthTokenResponse>{
      try {
          const response = await axios.post(this.tokenUrl, {
              grant_type: 'authorization_code',
              client_id: this.apiKey,
              client_secret: this.secretKey,
              code: authorizationCode,
              redirect_uri: this.callBackUrl,
          },{
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            },
          });
          return response.data;
      } catch (error) {
          this.error(`getTokenFromAuthCode() - ${error}`);
          throw error;
      }
    }

  /**
    Extracts the authorization code from a URL.
    @param {string} url - The URL containing the authorization code.
    @returns {string|null} - The extracted authorization code, or null if not found.
  */
  getCodeFromURL(url: String){
    var code = null;
    if (url.indexOf("code") !== -1){
      const spl =url.split("?code=");
      return spl[spl.length-1].split("&")[0];
    }
    return code;
  }

  /**
    Retrieves the authorization code from a full URL, obtains an access token using the code, and inserts the token data.
    @param {string} fullUrl - The full URL containing the authorization code.
    @returns {Promise<void>} - A promise that resolves when the token data is inserted successfully.
    @throws {Error} - If there is an error while retrieving the authorization code or obtaining the access token.
  */
  async getAuthCode(fullUrl: string) {
    try {
        const authCode = this.getCodeFromURL(fullUrl);
        const resp = await this.getTokenFromAuthCode(authCode);
        insertTSTokenData(resp);
    } catch (error) {
      this.error(`getAuthCode() - ${error}`);
    }
  }

  /**
  Inserts token data into a file.
  @param {rawAuthTokenResponse} data - The token data to be inserted.
  @returns {boolean} - True if the token data is inserted successfully, false otherwise.
  */
  insertTSTokenData(data:rawAuthTokenResponse): boolean {
    try {
        if (typeof data?.timeStamp === 'undefined') {
            (data as any).timeStamp = Date.now();
        }
        return this.writeTSTokenFile(data, TOKEN_FILE_NAME);
    } catch (error) {
      this.error(`insertTSTokenData() - ${error}`);
        return false;
    }
  }

  /**
  Checks if the access token is expired.
  It reads the token data from the tokenFile and calculates
  the time difference between the current time and the token timestamp.
  If the time difference is greater than 15 minutes, it returns
  true indicating that the token is expired.
  Otherwise, it returns false indicating that the token is not expired.
  */
  isTokenExpired(): boolean {
    const tokenData = this.readTSTokenFile(this.tokenFile);
    if (tokenData != null) {
        var token_ts = tokenData?.timeStamp;
        if (typeof token_ts === 'undefined') {
            return false;
        } else {
            // if timedelta for the timestamp is > than minutes its expired.
            // Called everytime its needed from renderer.
            const minutes = 15;
            return (Date.now() - token_ts) / 1000 / 60 > minutes ? true : false;
        }
    } else {
        return false;
    }
  }

  updateTSTokenData(refreshTokenData: rawRefreshTokenResponse): boolean{
    const tokenData = this.readTSTokenFile(this.tokenFile);
    if (tokenData === null) {
        this.error(`updateTSTokenData() - Need Authorization Code & Refresh Token.`);
        return false;
    } else {
        try {
            const updatedObject: fullTokenResponse = {
                access_token: refreshTokenData.access_token,
                refresh_token: tokenData.refresh_token,
                id_token: refreshTokenData.id_token,
                token_type: refreshTokenData.token_type,
                scope: tokenData.scope,
                timeStamp: Date.now(),
                expires_in: refreshTokenData.expires_in
            };
            return this.writeTSTokenFile(updatedObject, TOKEN_FILE_NAME);
        } catch (error) {
            return false;
        }
    }
  }

  readTSTokenFile(fileName: string): rawAuthTokenResponse | null {
    try {
      const data = fs.readFileSync(fileName, 'utf-8');
      const parsedData = JSON.parse(data);
      return parsedData;
    } catch (error) {
      this.error(`readTSTokenFile() - ${error}`);
      return null;
    }
  }

  /**
  Writes token data to a file.
  @param {rawAuthTokenResponse} data - The token data to be written.
  @param {string} fileName - The name of the file to write the data to.
  @returns {boolean} - True if the token data is written successfully, false otherwise.
  */
  writeTSTokenFile(data: rawAuthTokenResponse, fileName: string): boolean {
    try {
      fs.writeFileSync(fileName, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    } catch (error) {
      this.error(`writeTSTokenFile() - ${error}`);
      return false;
    }
  }

}
