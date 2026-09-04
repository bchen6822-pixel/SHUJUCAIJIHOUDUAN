const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const https = require('https');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
app.use(bodyParser.json());

// 你的数据库已经填好！
const MONGODB_URI = "mongodb+srv://bchen6822_db_user:OSmT19fe4MN6WifO@cluster0.0peovwc.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGODB_URI)
.then(()=>console.log("✅ 云端数据库连接成功，数据永不丢失"))
.catch(err=>console.log("❌ 数据库连接失败：",err));

let admin = {
  user: "admin",
  pwd: "admin123"
};

const userSchema = new mongoose.Schema({
  username:String,
  password:String,
  enabled:Boolean,
  createdAt:String,
  expireAt:String,
  token:String,
  activeTime:String,
  deviceFp:String,
  changeDeviceTimes:Number,
  sessionId:String,
  days:Number
});
const User = mongoose.model('User',userSchema);

const poolSchema = new mongoose.Schema({
  id:Number,
  apiUrl:String,
  remark:String,
  status:String,
  lastTestTime:String,
  todayCount:Number,
  totalCount:Number,
  isWorking:Boolean,
  lastCallTime:String,
  resetDate:String
});
const Pool = mongoose.model('Pool',poolSchema);

const browserHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36,Chrome/135.0.0.0 Safari/537.36',
  'Referer': 'https://www.tiktok.com/',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

function now() {
  return new Date().toISOString();
}
function genToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function genSessionId(){
  return Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.post('/api/login', async (req, res) => {
  const { username, password, device_fp } = req.body;
  const user = await User.findOne({username});
  
  if (!user) return res.json({ ok: false, msg: '账号不存在' });
  if (user.password !== password) return res.json({ ok: false, msg: '密码错误' });
  if (!user.enabled) return res.json({ ok: false, msg: '账号已禁用' });

  if(!user.activeTime) user.activeTime = null;
  if(!user.deviceFp) user.deviceFp = "";
  if(!user.changeDeviceTimes) user.changeDeviceTimes = 1;
  if(!user.sessionId) user.sessionId = "";
  if(!user.days) user.days = null;

  if(!user.activeTime){
    user.activeTime = now();
    if(user.days && user.days > 0){
      user.expireAt = new Date(Date.now() + user.days * 86400000).toISOString();
    }
  }

  if(user.expireAt && Date.now() > new Date(user.expireAt).getTime()){
    return res.json({ ok: false, msg: '账号已过期' });
  }

  if(user.deviceFp && user.deviceFp !== device_fp){
    if(user.changeDeviceTimes <= 0){
      return res.json({ ok: false, msg: '设备已锁定，请联系管理员解锁' });
    }else{
      user.changeDeviceTimes -= 1;
      user.deviceFp = device_fp;
    }
  }

  if(!user.deviceFp){
    user.deviceFp = device_fp;
  }

  const token = genToken();
  const sessionId = genSessionId();
  user.token = token;
  user.sessionId = sessionId;
  await user.save();
  res.json({ ok: true, token, sessionId });
});

app.post('/api/check', async (req, res) => {
  const { username, token } = req.body;
  const user = await User.findOne({username});
  if (!user || !user.enabled || !user.token || user.token !== token) return res.json({ ok: false });
  if (user.expireAt && Date.now() > new Date(user.expireAt).getTime()) return res.json({ ok: false });
  res.json({ ok: true });
});

app.post('/api/check-auth', async (req, res) => {
  const { username, device_fp } = req.body;
  const user = await User.findOne({username});

  if(!user || !user.enabled){
    return res.json({ code: -99, msg: '账号不可用' });
  }
  if(!user.activeTime){
    return res.json({ code: 0, msg: '未激活' });
  }
  if(user.expireAt && Date.now() > new Date(user.expireAt).getTime()){
    return res.json({ code: -1, msg: '账号已过期' });
  }
  if(user.deviceFp && user.deviceFp !== device_fp){
    return res.json({ code: -2, msg: '设备不匹配' });
  }
  return res.json({ code: 0, msg: '验证通过' });
});

app.post('/api/admin/reset-device-times', async (req, res) => {
  const { username } = req.body;
  const user = await User.findOne({username});
  if(!user) return res.json({ ok:false, msg:'用户不存在' });
  user.changeDeviceTimes = 1;
  await user.save();
  res.json({ ok:true });
});

app.post('/api/admin/set-device-times', async (req, res) => {
  const { username, times } = req.body;
  const user = await User.findOne({username});
  if(!user) return res.json({ ok:false, msg:'用户不存在' });
  user.changeDeviceTimes = parseInt(times) || 0;
  await user.save();
  res.json({ ok:true });
});

app.post('/api/admin/force-logout', async (req, res) => {
  const { username } = req.body;
  const user = await User.findOne({username});
  if(user){
    user.token = null;
    user.sessionId = null;
    await user.save();
  }
  res.json({ ok:true });
});

app.post('/api/admin/login', (req, res) => {
  const { user, pwd } = req.body;
  if (user === admin.user && pwd === admin.pwd) return res.json({ ok: true });
  res.json({ ok: false });
});

app.get('/api/admin/list', async (req, res) => {
  const list = await User.find({});
  list.forEach(item=>{
    if(!item.activeTime) item.activeTime = null;
    if(!item.deviceFp) item.deviceFp = "";
    if(!item.changeDeviceTimes) item.changeDeviceTimes = 1;
    if(!item.sessionId) item.sessionId = "";
    if(!item.days) item.days = null;
  });
  const showList = list.map(item => {
    const temp = {...item._doc};
    if(!temp.activeTime){
      temp.displayExpire = temp.days && temp.days > 0 ? `${temp.days}天` : "永久";
    }else{
      temp.displayExpire = temp.expireAt ? new Date(temp.expireAt).toLocaleString() : "永久";
    }
    return temp;
  });
  res.json(showList);
});

app.post('/api/admin/delete', async (req, res) => {
  const { username } = req.body;
  await User.deleteOne({username});
  res.json({ ok: true });
});

app.post('/api/admin/toggle', async (req, res) => {
  const { username, enabled } = req.body;
  const user = await User.findOne({username});
  if (user) {
    user.enabled = enabled;
    if (!enabled) user.token = null;
    await user.save();
  }
  res.json({ ok: true });
});

app.post('/api/admin/batch', async (req, res) => {
  const { lines, days } = req.body;
  const arr = lines.split(/\n/).map(x => x.trim()).filter(Boolean);
  let success = 0, exist = 0;

  for (const line of arr) {
    const [user, pwd] = line.split(/\s+/).filter(Boolean);
    if (!user || !pwd) continue;
    const findOne = await User.findOne({username:user});
    if(findOne) {exist++;continue;}

    await User.create({
      username: user,
      password: pwd,
      enabled: true,
      createdAt: now(),
      expireAt: null,
      token: null,
      activeTime: null,
      deviceFp: "",
      changeDeviceTimes: 1,
      sessionId: null,
      days: days > 0 ? days : null
    });
    success++;
  }
  res.json({ ok: true, success, exist });
});

app.post('/api/admin/set-user-pwd', (req, res) => {
  const { newUser, newPwd } = req.body;
  if (newUser) admin.user = newUser;
  if (newPwd) admin.pwd = newPwd;
  res.json({ ok: true });
});

app.post('/api/admin/set-expire', async (req, res) => {
  const { username, days } = req.body;
  const user = await User.findOne({username});
  if (!user) return res.json({ ok: false, msg: "用户不存在" });

  if (days <= 0) {
    user.days = null;
    user.expireAt = null;
  } else {
    user.days = days;
    if(user.activeTime){
      user.expireAt = new Date(Date.now() + days * 86400 * 1000).toISOString();
    }else{
      user.expireAt = null;
    }
  }
  await user.save();
  res.json({ ok: true });
});

app.get('/api/tiktok-user', async (req, res) => {
  try {
    const { unique_id } = req.query;
    if (!unique_id) {
      return res.json({ code: -1, msg: '缺少参数' });
    }
    const apiUrl = `https://www.tikwm.com/api/user/info?unique_id=${unique_id}`;
    const result = await axios.get(apiUrl, { 
      timeout: 15000,
      headers: browserHeaders
    });
    res.json(result.data);
  } catch (e) {
    res.json({ code: -1, msg: '请求失败' });
  }
});

app.get('/api/admin/pool-list',async (req,res)=>{
  let list = await Pool.find({});
  const today = new Date().toLocaleDateString();
  list.forEach(async item=>{
    if(!item.todayCount) item.todayCount = 0;
    if(!item.totalCount) item.totalCount = 0;
    if(!item.isWorking) item.isWorking = false;
    if(!item.lastCallTime) item.lastCallTime = "";
    if(!item.resetDate) item.resetDate = today;
    if(!item.status) item.status = "normal";
    if(!item.lastTestTime) item.lastTestTime = "";
    if(item.resetDate !== today){
      item.todayCount = 0;
      item.resetDate = today;
      await item.save();
    }
  });
  res.json(list);
});

app.post('/api/admin/pool-save',async (req,res)=>{
  const { id, apiUrl, remark } = req.body;
  if(id){
    const item = await Pool.findOne({id});
    if(item){
      item.apiUrl = apiUrl;
      item.remark = remark;
      await item.save();
    }
  }else{
    await Pool.create({
      id: Date.now(),
      apiUrl,
      remark,
      status:"normal",
      lastTestTime:"",
      todayCount:0,
      totalCount:0,
      isWorking:false,
      lastCallTime:"",
      resetDate: new Date().toLocaleDateString()
    });
  }
  res.json({ok:true});
});

app.post('/api/admin/pool-del',async (req,res)=>{
  await Pool.deleteOne({id:req.body.id});
  res.json({ok:true});
});

app.post('/api/admin/pool-test-one',async (req,res)=>{
  const {apiUrl} = req.body;
  let status = "normal";
  try{
    await axios.get(apiUrl,{
      timeout:8000,
      headers: browserHeaders,
      validateStatus: () => true
    });
  }catch(e){
    status = "banned";
  }
  const item = await Pool.findOne({apiUrl});
  if(item){
    item.status = status;
    item.lastTestTime = now();
    await item.save();
  }
  res.json({ok:true,status});
});

app.post('/api/admin/pool-test-all',async (req,res)=>{
  let list = await Pool.find({});
  for(let item of list){
    let status = "normal";
    try{
      await axios.get(item.apiUrl,{
        timeout:8000,
        headers: browserHeaders,
        validateStatus: () => true
      });
    }catch(e){
      status = "banned";
    }
    item.status = status;
    item.lastTestTime = now();
    await item.save();
  }
  res.json({ok:true});
});

let autoCheckInterval = null;
const AUTO_CHECK_INTERVAL = 60 * 60 * 1000;

async function autoCheckPool(){
  let list = await Pool.find({});
  for(let item of list){
    let status = "normal";
    try{
      await axios.get(item.apiUrl,{
        timeout:8000,
        headers: browserHeaders,
        validateStatus: () => true
      });
    }catch(e){
      status = "banned";
    }
    item.status = status;
    item.lastTestTime = now();
    await item.save();
  }
  console.log("✅ 定时自动检测接口池完成");
}

app.post('/api/admin/set-auto-check',(req,res)=>{
  const {open} = req.body;
  if(open){
    if(autoCheckInterval) clearInterval(autoCheckInterval);
    autoCheckInterval = setInterval(autoCheckPool, AUTO_CHECK_INTERVAL);
    autoCheckPool();
  }else{
    if(autoCheckInterval){
      clearInterval(autoCheckInterval);
      autoCheckInterval = null;
    }
  }
  res.json({ok:true});
});

app.get('/api/tiktok-rotate',async (req,res)=>{
  const {username} = req.query;
  if(!username) return res.json({success:false,msg:"缺少username参数"});

  let list = await Pool.find({status:"normal"});
  if(list.length === 0){
    return res.json({success:false,msg:"暂无可用抓取节点，请后台检查接口池"});
  }

  let randomNode = list[Math.floor(Math.random()*list.length)];
  randomNode.isWorking = true;
  randomNode.todayCount += 1;
  randomNode.totalCount += 1;
  randomNode.lastCallTime = now();
  await randomNode.save();

  try{
    const targetUrl = `${randomNode.apiUrl}/get-avatar?username=${username}`;
    const result = await axios.get(targetUrl,{
      timeout:10000,
      headers: browserHeaders
    });
    randomNode.isWorking = false;
    await randomNode.save();
    res.json(result.data);
  }catch(e){
    randomNode.status = "banned";
    randomNode.isWorking = false;
    await randomNode.save();
    res.json({success:false,msg:"当前节点抓取失败，已自动标记封禁，请重试"});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ 服务运行正常，端口：${PORT}`));
