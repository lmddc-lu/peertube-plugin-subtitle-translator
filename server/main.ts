import type { RegisterServerOptions } from "@peertube/peertube-types";
import { VideoChannelModel } from "@peertube/peertube-types/server/core/models/video/video-channel";
const webvtt = require("node-webvtt");

interface Lock {
  locked: boolean;
  changed: string;
}

async function register({
  peertubeHelpers,
  getRouter,
  storageManager,
  registerHook,
  registerSetting,
  settingsManager
}: RegisterServerOptions): Promise<void> {
  
  registerSetting({
    name: "subtitle-translation-api-url",
    type: "input",
    label: "Subtitle translation API URL",
    default: "http://subtitle_translator_api",
    private: false
  })

  registerHook({
    target: 'action:api.video-caption.created',
    handler: async ({ req, res } : {req:any, res:any}) => {
      // This is the request sent
      // let formdata = new FormData();
      // formdata.append('captionfile', new Blob([translationready_srt], {type: 'text/plain'}), translationready_targetLanguage + ".srt");
      // const res = await fetch(`/api/v1/videos/${parameters.id}/captions/${translationready_targetLanguage}`, {
      //   method: 'PUT',
      //   body: formdata,
      //   ...fetchCredentials,
      // } as any);
  
      
      let videoId : string = req.params.videoId;

      
      // delete the translation from the local plugin storage
      await storageManager.storeData("subtitle-translation-" + videoId, null);
  
      // peertubeHelpers.logger.info("deleted translation from local storage");
    }
  })
  const router = getRouter();
  router.get("/lock", async (req, res) => {
    const videoId = req.query.id as string;
    if (
      !videoId.match(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )
    ) {
      peertubeHelpers.logger.error("Possibly invalid videoid");
      res.json({
        locked: true,
        changed: "",
      });
      return;
    }

    const user = await peertubeHelpers.user.getAuthUser(res);
    peertubeHelpers.videos.loadByUrl;
    const video = await peertubeHelpers.videos.loadByIdOrUUID(videoId);
    let userCanAccess = await userIdCanAccessVideo(user.id, video.channelId);
    if (!user || !userCanAccess) {
      peertubeHelpers.logger.info("User cannot access video lock");
      res.status(403);
      res.json({});
      return;
    }

    const locked = (await storageManager.getData(
      "subtitle-lock-" + videoId
    )) as unknown as Lock | null;

    res.json({
      locked: locked?.locked || false,
      changed: locked?.changed || "",
    });
  });

  router.put("/lock", async (req, res) => {
    const videoId = req.query.id as string;
    if (
      !videoId.match(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )
    ) {
      peertubeHelpers.logger.error("Possibly invalid videoid");
      res.json({
        locked: true,
        changed: "",
      });
      return;
    }
    const user = await peertubeHelpers.user.getAuthUser(res);
    const newState = req.body.locked as boolean;
    const video = await peertubeHelpers.videos.loadByIdOrUUID(videoId);
    let userCanAccess = await userIdCanAccessVideo(user.id, video.channelId);

    if (!user || !userCanAccess) {
      peertubeHelpers.logger.info("User cannot access video lock");
      res.status(403);
      res.json({});
      return;
    }

    const lock: Lock = {
      changed: new Date().toISOString(),
      // Only accept true, in case use sends something else
      locked: newState == true,
    };

    await storageManager.storeData("subtitle-lock-" + videoId, lock);

    res.json(lock);
  });

  router.post("/translate", async (req, res) => {
    const videoId = req.query.id as string;
    if (
      !videoId.match(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )
    ) {
      peertubeHelpers.logger.error("Possibly invalid videoid");
      res.json({
        locked: true,
        changed: "",
      });
      return;
    }
    const user = await peertubeHelpers.user.getAuthUser(res);
    const video = await peertubeHelpers.videos.loadByIdOrUUID(videoId);
    let userCanAccess = await userIdCanAccessVideo(user.id, video.channelId);

    if (!user || !userCanAccess) {
      peertubeHelpers.logger.info("User cannot access video lock");
      res.status(403);
      res.json({});
      return;
    }

    let originalLanguage = req.body.originalLanguage as string;
    let targetLanguage = req.body.targetLanguage as string;
    let captions = webvtt.parse(req.body.captions as string);

    if (captions.valid) {
      peertubeHelpers.logger.info("The vtt file is valid");
      let srt = convertToJsonToSrt(captions.cues);
      peertubeHelpers.logger.info("Translate request srt: " + srt);

      peertubeHelpers.logger.info(
        "Translate request originalLanguage : " + originalLanguage
      );
      peertubeHelpers.logger.info(
        "Translate request targetLanguage: " + targetLanguage
      );
      peertubeHelpers.logger.info("Translate request captions: " + captions);

      storageManager.storeData("subtitle-translation-" + videoId, {
        status: "pending",
        targetLanguage: targetLanguage,
        srt: "",
      });

      peertubeHelpers.logger.info("Translate request stored pending at " + "subtitle-translation-" + videoId);

      translateSubtitles(srt, originalLanguage, targetLanguage).then(
        async (translatedSrt) => {
          peertubeHelpers.logger.info(
            "Translate request finished"
          );
          // Save the translated srt
          // Store the caption with associated video, user and language
          storageManager.storeData(
            "subtitle-translation-" + videoId,
            {
              status: "done",
              targetLanguage: targetLanguage,
              srt: translatedSrt,
            }
          );

          peertubeHelpers.logger.info(
            "Translate request stored translated srt at " + "subtitle-translation-" + videoId
          );
          peertubeHelpers.logger.info("srt: " + srt);
        }
      );

      res.status(200);
      res.json({ status: "Translation pending" });
    }
  });

  router.get("/check-translation", async (req, res) => {
    const videoId = req.query.id as string;
    if (
      !videoId.match(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )
    ) {
      peertubeHelpers.logger.error("Possibly invalid videoid");
      res.json({
        locked: true,
        changed: "",
      });
      return;
    }
    const user = await peertubeHelpers.user.getAuthUser(res);
    const video = await peertubeHelpers.videos.loadByIdOrUUID(videoId);

    let userCanAccess = await userIdCanAccessVideo(user.id, video.channelId);

    if (!user || !userCanAccess) {
      peertubeHelpers.logger.info("User cannot access video lock");
      res.status(403);
      res.json({});
      return;
    }

    let translation = await storageManager.getData(
      "subtitle-translation-" + videoId
    );

    if (translation) {
      try {
        let translation_json = translation as any;

        if (translation_json.status == "done") {
          let response = {
            status: "done",
            targetLanguage: translation_json.targetLanguage,
            srt: translation_json.srt,
          };

          res.status(200);
          res.json(response);
          return;

        } else {
          peertubeHelpers.logger.info("Translation pending");
          let response= {
            status: "pending",
            targetLanguage: translation_json.targetLanguage,
          };
          res.status(200);
          res.json(response);
          return;

       }
      } catch (error) {
        peertubeHelpers.logger.error("Error parsing translation: " + error);
        peertubeHelpers.logger.info("No translation pending");
        res.status(200);
        res.json({ status: "none" });
        return;

      }
      
    } else {
      peertubeHelpers.logger.info("No translation pending");
      res.status(200);
      res.json({ status: "none" });
      return;

    }
  });

  router.get("/available-pairs", async (req, res) => {
    const user = await peertubeHelpers.user.getAuthUser(res);

    if (!user) {
      peertubeHelpers.logger.info("User cannot access video translation");
      res.status(403).json({});
      return;
    }
      let api_url = await settingsManager.getSetting('subtitle-translation-api-url');

    fetch(
      `${api_url}/existing_language_pairs/cached`,
      {
        method: "GET",
      }
    )
      .then((resp) => {
        if (!resp.ok) {
          throw new Error(`HTTP error! status: ${resp.status}`);
        }
        return resp.json();
      })
      .then((data) => {
        res.status(200).json(data);
      })
      .catch((error) => {
        res.status(500).json({ error: error.message });
      });
  });

  async function translateSubtitles(
    srt: string,
    originalLanguage: string,
    targetLanguage: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let formData = new FormData();
      formData.append("file", new Blob(srt.split("")), "subtitles.srt");
      settingsManager.getSetting('subtitle-translation-api-url').then((api_url) => {
        peertubeHelpers.logger.info("api_url : ", api_url);
        fetch(
          `${api_url}/translate_srt/${originalLanguage}/${targetLanguage}`,
          {
            method: "POST",
            body: formData,
          }
        )
          .then((response) => {
            response
              .text()
              .then((data) => {
                // json parse the response
                let translatedSrt = JSON.parse(data).translated_srt;

                resolve(translatedSrt);
              })
              .catch((error) => {
                reject(error);
              });
          })
          .catch((error) => {
            reject(error);
          });
      });
    });
  }

  interface SubtitleItem {
    identifier?: string;
    start: number;
    end: number;
    text: string;
    styles?: string;
  }
  function padZero(value: number, length: number = 2): string {
    return value.toString().padStart(length, "0");
  }
  function formatTime(timeInSeconds: number): string {
    const hours = Math.floor(timeInSeconds / 3600);
    const minutes = Math.floor((timeInSeconds % 3600) / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    const milliseconds = Math.round((timeInSeconds % 1) * 100);

    return `${padZero(hours)}:${padZero(minutes)}:${padZero(seconds)},${padZero(
      milliseconds,
      3
    )}`;
  }

  function convertToJsonToSrt(jsonObj: Record<string, SubtitleItem>): string {
    let srtContent = "";
    let index = 1;

    Object.values(jsonObj).forEach((item) => {
      const startTime = formatTime(item.start);
      const endTime = formatTime(item.end);

      srtContent += `${index}\n`;
      srtContent += `${startTime} --> ${endTime}\n`;
      srtContent += `${item.text}\n\n`;

      index++;
    });

    return srtContent;
  }

  async function userIdCanAccessVideo(
    userID?: number,
    channelID?: number
  ): Promise<boolean> {
    if (typeof userID != "number" || typeof channelID != "number") {
      return false;
    }

    const userVideoChannelList = await queryDb<VideoChannelModel>(
      `SELECT * FROM "videoChannel" WHERE "id" = ${channelID};`
    );
    const videoChannel = userVideoChannelList[0];

    const accountVideoChannelList = await queryDb<VideoChannelModel>(
      `SELECT * FROM "videoChannel" WHERE "accountId" = ${videoChannel.accountId};`
    );
    return (
      accountVideoChannelList.find((v) => v && v.id === channelID) !== undefined
    );
  }

  async function queryDb<T>(q: string): Promise<T[]> {
    const res = await peertubeHelpers.database.query(q);
    if (res.length !== 0) {
      return res[0] || [];
    }

    return [];
  }
}

async function unregister(): Promise<void> {}

module.exports = {
  register,
  unregister,
};
