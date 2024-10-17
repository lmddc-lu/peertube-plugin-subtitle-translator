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

  registerSetting({
    name: "subtitle-translation-timeout",
    type: "input",
    label: "Subtitle translation timeout (in minutes)",
    default: "10",
    private: false
  })

  registerHook({
    target: 'action:api.video-caption.created',
    handler: async ({ req, res } : {req:any, res:any}) => {
      let videoId : string = req.params.videoId;
      
      // delete the translation from the local plugin storage
      await storageManager.storeData("subtitle-translation-" + videoId, null);
  
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

    // Check if a translation is already pending
    let status = await storageManager.getData(
      "subtitle-translation-" + videoId
    ) as unknown as any | null;
    
  
    if(status) {
      if(status.status && (status.status == 'pending' ||  status.status == 'done')){
        peertubeHelpers.logger.info("Translation already pending or done");
        res.status(200);
        res.json({ status: "Translation already pending" });
        return;
      }
    }

    let captions = webvtt.parse(req.body.captions as string);

    if (captions.valid) {
      peertubeHelpers.logger.info("The vtt file is valid");
      let srt = convertToJsonToSrt(captions.cues);
      // peertubeHelpers.logger.info("Translate request srt: " + srt);

      peertubeHelpers.logger.info(
        "Translate request originalLanguage : " + originalLanguage
      );
      peertubeHelpers.logger.info(
        "Translate request targetLanguage: " + targetLanguage
      );
      // peertubeHelpers.logger.info("Translate request captions: " + captions);

      storageManager.storeData("subtitle-translation-" + videoId, {
        status: "pending",
        targetLanguage: targetLanguage,
        date: new Date().toISOString(),
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
          let status = await storageManager.getData(
            "subtitle-translation-" + videoId
          ) as unknown as any | null;
          
          if(status && status.status != "pending"){
            // the translation has been aborted
            peertubeHelpers.logger.info("The translation was aborted"); 
            return;
          }

          storageManager.storeData(
            "subtitle-translation-" + videoId,
            {
              status: "done",
              targetLanguage: targetLanguage,
              date: new Date().toISOString(),
              srt: translatedSrt,
            }
          );

          peertubeHelpers.logger.info(
            "Translate request stored translated srt at " + "subtitle-translation-" + videoId
          );
        }
      ).catch((error) => {
        peertubeHelpers.logger.error("Error translating subtitles: " + error);
        storageManager.storeData(
          "subtitle-translation-" + videoId,
          {
            status: "none",
          }
        );
      });

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

        } else if(translation_json.status == "pending"){
          if(translation_json.date){


            let timeElapsed = (new Date().getTime() - new Date(translation_json.date).getTime());
            peertubeHelpers.logger.info("Time elapsed waiting for translation (ms): " + timeElapsed);

            let timeout = 10 * 60 * 1000;
            let api_timeout = await settingsManager.getSetting('subtitle-translation-timeout');
            
            try{
              let api_timeout_string = api_timeout.toString();
              let api_timeout_number = parseInt(api_timeout_string);
              timeout = api_timeout_number * 60 * 1000;
              // peertubeHelpers.logger.info("Timeout set to: " + timeout);

            } catch(error) {
              peertubeHelpers.logger.error("Error parsing timeout: " + error);
            }
            peertubeHelpers.logger.info("Using timeout : " + timeout);
            if(timeElapsed > timeout) {
              peertubeHelpers.logger.info("Translation pending since more than 5 minutes");
              storageManager.storeData(
                "subtitle-translation-" + videoId,
                {
                  status: "none",
                }
              );
  
              res.status(200);  
              res.json({ status: "aborted" });
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
           
          }
          else
          {
            // Old format, no date: cancel the translation
            peertubeHelpers.logger.info("No date in translation, canceling translation");
            storageManager.storeData(
              "subtitle-translation-" + videoId,
              {
                status: "none",
              }
            );


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
      `${api_url}/existing_language_pairs`,
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
        fetch(
          `${api_url}/translate_srt/${originalLanguage}/${targetLanguage}`,
          {
            method: "POST",
            body: formData,
            headers: {
              'Connection': 'keep-alive'
            },
          },
          
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
