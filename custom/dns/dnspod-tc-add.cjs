// 通过腾讯云云解析 DNSPod API 为 example.com 添加 sp A 记录
// 密钥只从环境变量读取，不写入任何文件
const tencentcloud = require("tencentcloud-sdk-nodejs-dnspod");

const secretId = process.env.TENCENTCLOUD_SECRET_ID;
const secretKey = process.env.TENCENTCLOUD_SECRET_KEY;
if (!secretId || !secretKey) {
  console.error("缺少环境变量 TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY");
  process.exit(1);
}

const DnspodClient = tencentcloud.dnspod.v20210323.Client;
const client = new DnspodClient({
  credential: { secretId, secretKey },
  region: "",
  profile: { httpProfile: { endpoint: "dnspod.tencentcloudapi.com" } },
});

const DOMAIN = process.env.DNSPOD_DOMAIN || "example.com";
const SUB = process.env.DNS_SUB || "sp";
const VALUE = process.env.DNS_VALUE || "203.0.113.1";

async function main() {
  console.log("== 1. 账号下的域名 ==");
  try {
    const list = await client.DescribeDomainList({ Offset: 0, Limit: 100 });
    const names = (list.DomainList || []).map((d) => d.Name);
    console.log(names.join(", ") || "(空)");
  } catch (e) {
    console.log("查询域名列表失败:", e.message);
  }

  console.log("\n== 2. 现有 " + SUB + " 记录 ==");
  try {
    const rec = await client.DescribeRecordList({ Domain: DOMAIN, Subdomain: SUB, Limit: 20 });
    const rows = rec.RecordList || [];
    console.log(rows.length ? JSON.stringify(rows.map((r) => ({ id: r.RecordId, type: r.Type, value: r.Value, ttl: r.TTL }))) : "(无)");
    const hit = rows.find((r) => r.Type === "A" && r.Value === VALUE);
    if (hit) {
      console.log("记录已存在，无需添加。RecordId=" + hit.RecordId);
      return;
    }
  } catch (e) {
    console.log("查询记录失败:", e.message);
  }

  console.log("\n== 3. 添加 A 记录 " + SUB + "." + DOMAIN + " -> " + VALUE + " ==");
  const res = await client.CreateRecord({
    Domain: DOMAIN,
    SubDomain: SUB,
    RecordType: "A",
    RecordLine: "默认",
    Value: VALUE,
    TTL: 600,
  });
  console.log("成功，RecordId=" + res.RecordId);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  if (e.requestId) console.error("requestId:", e.requestId);
  process.exit(1);
});
