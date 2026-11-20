import { describe, expect, it } from "@jest/globals";
import { getMailTrackerNotice, matchKnownTracker } from "../mail-trackers";

describe("matchKnownTracker", () => {
  it.each([
    ["https://us5.list-manage.com/track/open.php?u=1&id=2&e=3", "us5.list-manage.com"],
    ["https://mandrillapp.com/track/open.php?u=1", "mandrillapp.com"],
    ["https://u123.ct.sendgrid.net/wf/open?upn=abc", "u123.ct.sendgrid.net"],
    ["https://abc.r.us-east-1.awstrack.me/I0/0100abc/xyz", "abc.r.us-east-1.awstrack.me"],
    ["https://e.customeriomail.com/e/o/eyJ", "e.customeriomail.com"],
    ["https://mailtrack.io/trace/mail/abc.png", "mailtrack.io"],
    ["https://abc123.emltrk.com/abc123?d=x", "abc123.emltrk.com"],
    ["https://r.superhuman.com/abc.png", "r.superhuman.com"],
    ["https://t.yesware.com/t/abc/def.png", "t.yesware.com"],
    ["https://mailfoogae.appspot.com/t?sender=x", "mailfoogae.appspot.com"],
    ["https://www.getnotify.com/notify/abc", "www.getnotify.com"],
    ["https://www.google-analytics.com/collect?v=1&tid=UA-1&t=event", "www.google-analytics.com"],
    ["https://ad.doubleclick.net/ddm/ad/abc", "ad.doubleclick.net"],
    ["https://www.facebook.com/tr?id=1&ev=PageView", "www.facebook.com"],
  ])("matches %s", (src, host) => {
    expect(matchKnownTracker(src)).toBe(host);
  });

  it("does not match near misses", () => {
    expect(matchKnownTracker("https://evil-list-manage.com/track/open.php")).toBeNull();
    expect(matchKnownTracker("https://us5.list-manage.com/track/open.php.png")).toBeNull();
    expect(matchKnownTracker("https://us5.list-manage.com/track/click")).toBeNull();
    expect(matchKnownTracker("https://www.facebook.com/tracking.png")).toBeNull();
    expect(matchKnownTracker("https://abc.awstrack.me/L0/link")).toBeNull();
    expect(matchKnownTracker("cid:list-manage.com/track/open.php")).toBeNull();
    expect(matchKnownTracker("data:image/png;base64,AAAA")).toBeNull();
  });

  it("normalizes protocol-relative, backslash and padded sources like a browser", () => {
    expect(matchKnownTracker("//us5.list-manage.com/track/open.php?u=1")).toBe("us5.list-manage.com");
    expect(matchKnownTracker("https:\\\\mailtrack.io\\trace\\mail\\a.png")).toBe("mailtrack.io");
    expect(matchKnownTracker(" https://r.super\thuman.com/x.png ")).toBe("r.superhuman.com");
  });
});

describe("getMailTrackerNotice", () => {
  it("counts trackers in the label", () => {
    expect(getMailTrackerNotice({ count: 1, hosts: ["a"] }).label).toBe("Blocked 1 tracker");
    expect(getMailTrackerNotice({ count: 3, hosts: ["a"] }).label).toBe("Blocked 3 trackers");
  });
});
