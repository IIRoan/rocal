import { Elysia } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { authenticatedRouteDetail } from "../lib/openapi";
import { prisma } from "../lib/prisma";
import { enforceRateLimit } from "../lib/rate-limit";
import { ProfileService } from "../services/profile.service";
import { RouteModel, routeModels } from "../contracts";

const profileService = new ProfileService(prisma);

const AVATAR_WRITE_RATE_LIMIT = { requests: 10, windowMs: 60_000 };

export const profilesRoutes = new Elysia({
  prefix: "/profiles",
  normalize: false,
})
  .use(routeModels)
  .use(requireAuth)
  .guard(authenticatedRouteDetail("Profiles"), (app) =>
    app
      .post("/lookup", {
        body: RouteModel.profiles.lookupBody,
        detail: {
          summary: "Look up Solace profile pictures",
          description:
            "Returns same-origin avatar proxy paths for Solace users matching the supplied email addresses.",
        },
      }, async ({ body }) => profileService.lookup(body.emails))
      .get("/avatar", {
        query: RouteModel.profiles.avatarQuery,
        detail: {
          summary: "Stream a Solace user's profile picture",
          description:
            "Fetches and streams the authenticated lookup target's profile picture through the API so clients avoid third-party CORS and hotlink restrictions.",
        },
      }, async ({ query, set }) => {
        const avatar = await profileService.streamAvatar(query.email, query.size);
        if (!avatar) {
          set.status = 404;
          return null;
        }
      
        set.headers["content-type"] = avatar.contentType;
        set.headers["cache-control"] = "private, max-age=300";
        return avatar.body;
      })
      .get("/avatars/:avatarId", {
        params: RouteModel.profiles.avatarIdParams,
        query: RouteModel.profiles.avatarSizeQuery,
        detail: {
          summary: "Stream an uploaded profile picture",
          description:
            "Streams the smallest stored WebP variant covering `size` physical pixels (default 512). Ids change on every upload, so responses are immutable.",
        },
      }, async ({ params, query, set }) => {
        const avatar = await profileService.streamUploadedAvatar(
          params.avatarId,
          query.size,
        );
        if (!avatar) {
          set.status = 404;
          return null;
        }

        set.headers["content-type"] = avatar.contentType;
        set.headers["cache-control"] = "private, max-age=86400, immutable";
        return avatar.body;
      })
      .put("/me/avatar", {
        body: RouteModel.profiles.uploadAvatarBody,
        detail: {
          summary: "Upload your profile picture",
          description:
            "Takes the base64 square crop chosen on-device and stores it only as WebP variants (32–512px) for the authenticated user's profile picture.",
        },
      }, async ({ body, routeUser }) => {
        enforceRateLimit({
          storeId: "profile-avatar",
          key: routeUser.id,
          limit: AVATAR_WRITE_RATE_LIMIT,
        });
        return profileService.uploadAvatar({
          userId: routeUser.id,
          image: body.image,
        });
      })
      .delete("/me/avatar", {
        parse: "none",
        detail: {
          summary: "Remove your profile picture",
          description:
            "Deletes the authenticated user's uploaded profile picture and clears any linked image.",
        },
      }, async ({ routeUser }) => {
        enforceRateLimit({
          storeId: "profile-avatar",
          key: routeUser.id,
          limit: AVATAR_WRITE_RATE_LIMIT,
        });
        return profileService.removeAvatar({ userId: routeUser.id });
      }),
  );
