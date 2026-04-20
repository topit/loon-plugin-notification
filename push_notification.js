/**
 * BOC 请求推送通知脚本
 * 监测目标站点的页面请求，发送 iOS 系统推送通知
 * 点击可在 iOS Safari 中打开对应链接
 * 支持 Bark 推送到 macOS，点击可在浏览器中打开
 * 
 * 参数通过 Loon [Argument] 传入，通过 $argument.xxx 获取
 */

// 解析参数 - Loon $argument 是对象，通过 .属性名 获取
var args = $argument;
console.log('[BOC Notification] $argument: ' + JSON.stringify(args));

var enableSafari = args.enable_safari !== 'false';
var enableBark = args.enable_bark === 'true';
var barkKey = (args.bark_key || '').trim();
var barkEndpoint = (args.bark_endpoint || 'https://api.day.app').trim();

console.log('[BOC Notification] enableSafari=' + enableSafari + ', enableBark=' + enableBark + ', barkKey=' + barkKey + ', barkEndpoint=' + barkEndpoint);

var url = $request.url;
var method = $request.method;

// 去重：检查该 URL 是否在 30 秒内已推送过，避免点击通知打开后再次触发
var DEDUP_KEY = 'boc_notification_dedup';
var DEDUP_INTERVAL = 30000;
var now = Date.now();

try {
    var dedupRaw = $persistentStore.read(DEDUP_KEY);
    if (dedupRaw) {
        var dedupMap = JSON.parse(dedupRaw);
        var lastTime = dedupMap[url];
        if (lastTime && (now - lastTime) < DEDUP_INTERVAL) {
            console.log('[BOC Notification] 跳过重复推送: ' + url);
            $done({});
        }
    }
} catch (e) {
    console.log('[BOC Notification] 去重检查异常: ' + e);
}

// 记录本次推送时间
try {
    var dedupMap = {};
    var dedupRaw = $persistentStore.read(DEDUP_KEY);
    if (dedupRaw) dedupMap = JSON.parse(dedupRaw);
    dedupMap[url] = now;
    // 清理过期记录
    for (var k in dedupMap) {
        if ((now - dedupMap[k]) > DEDUP_INTERVAL) delete dedupMap[k];
    }
    $persistentStore.write(JSON.stringify(dedupMap), DEDUP_KEY);
} catch (e) {
    console.log('[BOC Notification] 去重写入异常: ' + e);
}

// 从 URL 提取简短显示信息
var shortPath = url;
try {
    var parsed = new URL(url);
    shortPath = parsed.pathname + parsed.search;
    if (shortPath.length > 60) {
        shortPath = shortPath.substring(0, 57) + '...';
    }
} catch (e) {
    // 保留原始 URL
}

var title = 'BOC 请求捕获';
var subtitle = method + ' 请求';
var content = shortPath;

// 1. 发送 iOS 本地通知
var attach = {};
if (enableSafari) {
    attach.openUrl = url;
}
console.log('[BOC Notification] 推送通知: ' + method + ' ' + url);
$notification.post(title, subtitle, content, attach);

// 2. 发送 Bark 推送（到 macOS）
if (enableBark && barkKey) {
    barkEndpoint = barkEndpoint.replace(/\/+$/, '');
    var barkApiUrl = barkEndpoint + '/push';
    var barkBody = JSON.stringify({
        device_key: barkKey,
        title: title + ' - ' + subtitle,
        body: content,
        url: url
    });
    console.log('[BOC Notification] Bark POST: ' + barkApiUrl);
    console.log('[BOC Notification] Bark Body: ' + barkBody);
    $httpClient.post({
        url: barkApiUrl,
        timeout: 5000,
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        },
        body: barkBody
    }, function(errormsg, response, data) {
        if (errormsg) {
            console.log('[BOC Notification] Bark 推送失败: ' + errormsg);
        } else {
            console.log('[BOC Notification] Bark 响应 (' + response.status + '): ' + data);
        }
    });
} else if (enableBark && !barkKey) {
    console.log('[BOC Notification] Bark 已启用但未配置 Key，跳过推送');
}

// 放行请求，不做修改
$done({});
