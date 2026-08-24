import { Elysia } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { authenticatedRouteDetail } from "../lib/openapi";
import { prisma } from "../lib/prisma";
import { ProfileService } from "../services/profile.service";
import { RouteModel, routeModels } from "../contracts";

const profileService = new ProfileService(prisma);

export const profilesRoutes = new Elysia({
  prefix: "/profiles",
  normalize: false,
})
  .use(routeModels)
  .use(requireAuth)
  .guard(authenticatedRouteDetail("Profiles"), (app) =>
    app
      .post(
        "/lookup",
        async ({ body }) => profileService.lookup(body.emails),
        {
          body: RouteModel.profiles.lookupBody,
          detail: {
            summary: "Look up Solace profile pictures",
            description:
              "Returns same-origin avatar proxy paths for Solace users matching the supplied email addresses.",
          },
        },
      )
      .get(
        "/avatar",
        async ({ query, set }) => {
          const avatar = await profileService.streamAvatar(query.email);
          if (!avatar) {
            set.status = 404;
            return null;
          }

          set.headers["content-type"] = avatar.contentType;
          set.headers["cache-control"] = "private, max-age=300";
          return avatar.body;
        },
        {
          query: RouteModel.profiles.avatarQuery,
          detail: {
            summary: "Stream a Solace user's profile picture",
            description:
              "Fetches and streams the authenticated lookup target's profile picture through the API so clients avoid third-party CORS and hotlink restrictions.",
          },
        },
      ),
  );
