local auth_url = os.getenv("SOLACE_ADMIN_AUTH_URL") or ""
local gate_key = os.getenv("STALWART_ADMIN_GATE_KEY") or ""
local login_url = os.getenv("SOLACE_ADMIN_LOGIN_URL") or ""
local session_name = os.getenv("SOLACE_ADMIN_SESSION_COOKIE") or "__Secure-better-auth.session_token"
local step_up_name = os.getenv("SOLACE_ADMIN_STEP_UP_COOKIE") or "solace-passkey-step-up"
local session_prefix = session_name:match("^(.+%.)[^.]+$") or session_name
local remember_name = session_prefix .. "dont_remember"

local function application_cookie(name)
    return name == session_name or name == step_up_name or name == "solace_enc_pw"
        or name:sub(1, #session_prefix) == session_prefix
end

local function cookies(txn)
    local result = {}
    local headers = txn.http:req_get_headers()["cookie"] or {}
    for index = 0, #headers do
        for part in (headers[index] or ""):gmatch("[^;]+") do
            local name, value = part:match("^%s*([^=%s]+)%s*=%s*(.-)%s*$")
            if name then
                result[#result + 1] = {name, value}
            end
        end
    end
    return result
end

local function valid_auth_url()
    local host = auth_url:match("^http://([^/:]+):%d+/api/internal/stalwart/admin%-access$")
    return host and (host == "127.0.0.1" or host:match("^[%w.-]+%.railway%.internal$"))
end

local function valid_login_url()
    local scheme, host, port = login_url:match("^(https?)://([%w.-]+):?(%d*)/login$")
    return scheme == "https" or (scheme == "http" and port ~= "" and (host == "127.0.0.1" or host == "localhost"))
end

core.register_action("solace_admin_authorize", {"http-req"}, function(txn)
    txn:set_var("txn.solace_admin_status", "denied")
    if not valid_auth_url() or #gate_key < 32 or not valid_login_url() then return end
    txn:set_var("txn.solace_admin_login_url", login_url .. "?next=%2Fadmin")
    local selected, seen = {}, {}
    for _, cookie in ipairs(cookies(txn)) do
        if cookie[1] == session_name or cookie[1] == step_up_name or cookie[1] == remember_name then
            if seen[cookie[1]] then return end
            seen[cookie[1]] = true
            selected[#selected + 1] = cookie[1] .. "=" .. cookie[2]
        end
    end
    if not seen[session_name] then
        txn:set_var("txn.solace_admin_status", "login")
        return
    end
    local ok, response = pcall(function()
        return core.httpclient():get({
            url = auth_url,
            headers = {
                cookie = {table.concat(selected, "; ")},
                ["x-solace-admin-gate"] = {gate_key},
                ["x-real-ip"] = {txn.f:req_hdr("x-real-ip")},
            },
            timeout = 1000,
        })
    end)
    if not ok or not response then return end
    local auth_cookies = (response.headers or {})["set-cookie"] or {}
    txn:set_priv({auth_cookies = auth_cookies})
    txn:set_var("txn.solace_auth_cookies", next(auth_cookies) ~= nil)
    local status = ({[204] = "allowed", [401] = "login", [403] = "step_up"})[response.status]
    txn:set_var("txn.solace_admin_status", status or "denied")
end)

core.register_action("solace_strip_cookies", {"http-req"}, function(txn)
    local retained = {}
    for _, cookie in ipairs(cookies(txn)) do
        if not application_cookie(cookie[1]) then
            retained[#retained + 1] = cookie[1] .. "=" .. cookie[2]
        end
    end
    txn.http:req_del_header("cookie")
    if #retained > 0 then txn.http:req_add_header("cookie", table.concat(retained, "; ")) end
end)

core.register_action("solace_admin_response", {"http-after-res"}, function(txn)
    local headers = txn.http:res_get_headers()["set-cookie"] or {}
    txn.http:res_del_header("set-cookie")
    for index = 0, #headers do
        local value = headers[index]
        local name = value and value:match("^%s*([^=%s]+)%s*=")
        if name and not application_cookie(name) then txn.http:res_add_header("set-cookie", value) end
    end
    local data = txn:get_priv()
    if data then
        for index = 0, #data.auth_cookies do
            local value = data.auth_cookies[index]
            if value then txn.http:res_add_header("set-cookie", value) end
        end
    end
end)
