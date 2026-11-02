# Private trial launcher: serves this folder on http://localhost (this computer only) and opens the browser.
# Started by start-trial.bat. Uses only Windows PowerShell, no Python or Node. Close the window to stop.
# The browser keeps saves per address (including the port), so the default port is fixed.
param([int]$Port = 8765, [switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar

function Start-Listener([int]$p) {
    $l = New-Object System.Net.HttpListener
    $l.Prefixes.Add("http://localhost:$p/")
    $l.Start()
    return $l
}

$moved = $false
$requested = $Port
try { $listener = Start-Listener $Port } catch {
    # The fixed port is busy (for example a second window): ask the system for a free one.
    $probe = New-Object System.Net.Sockets.TcpListener ([Net.IPAddress]::Loopback), 0
    $probe.Start(); $Port = $probe.LocalEndpoint.Port; $probe.Stop()
    $listener = Start-Listener $Port
    $moved = $true
}
$prefix = "http://localhost:$Port/"

$types = @{
    '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
    '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'; '.txt' = 'text/plain; charset=utf-8'
    '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.gif' = 'image/gif'; '.webp' = 'image/webp'
    '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'; '.ogg' = 'audio/ogg'; '.mp3' = 'audio/mpeg'; '.wav' = 'audio/wav'
    '.woff' = 'font/woff'; '.woff2' = 'font/woff2'; '.wasm' = 'application/wasm'; '.xml' = 'application/xml; charset=utf-8'
}

Write-Host ''
Write-Host "  宝可梦地牢探索 · 私有试玩已启动：$prefix"
Write-Host '  浏览器会自动打开；没有打开就把上面的地址复制到浏览器。'
Write-Host '  试玩期间不要关闭本窗口；关闭窗口即停止。存档保存在浏览器里，与这个地址绑定。'
if ($moved) { Write-Host "  注意：常用端口 $requested 被占用（可能已开着另一个试玩窗口），这次换了端口，看不到平时的存档。" }
Write-Host ''
if (-not $NoBrowser) { Start-Process $prefix }

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $response = $context.Response
        # http.sys listens on every network card; serve only requests that come from this computer.
        if (-not [Net.IPAddress]::IsLoopback($context.Request.RemoteEndPoint.Address)) {
            $response.StatusCode = 403; try { $response.Close() } catch {}; continue
        }
        try {
            $path = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath).TrimStart('/')
            if ($path -eq '' -or $path.EndsWith('/')) { $path += 'index.html' }
            $file = [IO.Path]::GetFullPath((Join-Path $root $path))
            if (-not $file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or -not [IO.File]::Exists($file)) {
                $response.StatusCode = 404
            } else {
                $bytes = [IO.File]::ReadAllBytes($file)
                $type = $types[[IO.Path]::GetExtension($file).ToLowerInvariant()]
                if (-not $type) { $type = 'application/octet-stream' }
                $response.ContentType = $type
                $response.Headers.Add('Cache-Control', 'no-cache')
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            }
        } catch {
            # Setting the status fails once headers are sent (client went away); keep serving either way.
            try { $response.StatusCode = 500 } catch {}
        } finally {
            try { $response.Close() } catch {}
        }
    }
} finally {
    $listener.Stop()
}
