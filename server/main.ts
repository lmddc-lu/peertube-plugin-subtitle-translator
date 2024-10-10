import type { RegisterServerOptions } from '@peertube/peertube-types'
import { VideoChannelModel } from '@peertube/peertube-types/server/core/models/video/video-channel';

interface Lock {
  locked: boolean,
  changed: string,
};

async function register ({ peertubeHelpers, getRouter, storageManager }: RegisterServerOptions): Promise<void> {
  const router = getRouter();

  router.get('/lock', async (req, res) => {
    const videoId = req.query.id as string;
    if (!videoId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)) {
      peertubeHelpers.logger.error("Possibly invalid videoid");
      res.json({
        locked: true,
        changed: "",
      });
      return
    }
    const user = await peertubeHelpers.user.getAuthUser(res);
    peertubeHelpers.videos.loadByUrl
    const video = await peertubeHelpers.videos.loadByIdOrUUID(videoId);

    if (!user || !userIdCanAccessVideo(user.id, video.channelId)) {
      peertubeHelpers.logger.info("User cannot access video lock");
      res.status(403);
      res.json({});
      return;
    }

    const locked = await storageManager.getData("subtitle-lock-" + videoId) as unknown as Lock | null;

    res.json({
      locked: locked?.locked || false,
      changed: locked?.changed || "",
    });
  });

  router.put('/lock', async (req, res) => {
    const videoId = req.query.id as string;
    if (!videoId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)) {
      peertubeHelpers.logger.error("Possibly invalid videoid");
      res.json({
        locked: true,
        changed: "",
      });
      return
    }
    const user = await peertubeHelpers.user.getAuthUser(res);
    const newState = req.body.locked as boolean;
    const video = await peertubeHelpers.videos.loadByIdOrUUID(videoId);

    if (!user || !userIdCanAccessVideo(user.id, video.channelId)) {
      peertubeHelpers.logger.info("User cannot access video lock");
      res.status(403);
      res.json({});
      return;
    }

    const lock: Lock = {
      changed: new Date().toISOString(),
      // Only accept true, in case use sends something else
      locked: newState == true,
    }

    await storageManager.storeData("subtitle-lock-" + videoId, lock);

    res.json(lock);
  });

  router.post('/translate', async (req, res) => {
    const videoId = req.query.id as string;
    if (!videoId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)) {
      peertubeHelpers.logger.error("Possibly invalid videoid");
      res.json({
        locked: true,
        changed: "",
      });
      return
    }
    const user = await peertubeHelpers.user.getAuthUser(res);
    const video = await peertubeHelpers.videos.loadByIdOrUUID(videoId);

    if (!user || !userIdCanAccessVideo(user.id, video.channelId)) {
      peertubeHelpers.logger.info("User cannot access video lock");
      res.status(403);
      res.json({});
      return;
    }

    peertubeHelpers.logger.info("Translate request" + req.query.id as string);
    peertubeHelpers.logger.info("Translate request" + JSON.stringify(req.body) as string);


    res.status(200);
    res.json({"status": "ok"});

    // 
  });

  async function userIdCanAccessVideo(userId?: number, videoId?: number): Promise<boolean> {
    if (typeof userId != "number" || typeof videoId != "number") {
      return false;
    }

    const userVideoChannelList =
      await queryDb<VideoChannelModel>(`SELECT * FROM "videoChannel" WHERE "id" = ${userId};`);
    const videoChannel = userVideoChannelList[0];
    const accountVideoChannelList =
      await queryDb<VideoChannelModel>(`SELECT * FROM "videoChannel" WHERE "accountId" = ${videoChannel.accountId};`);
    return accountVideoChannelList.find(v => v && v.id === videoId) !== undefined;
  }

  async function queryDb<T>(q: string): Promise<T[]> {
    const res = await peertubeHelpers.database.query(q);
    if (res.length !== 0) {
      return res[0] || [];
    }

    return  [];
  }
}

async function unregister (): Promise<void> {}

module.exports = {
  register,
  unregister
}
