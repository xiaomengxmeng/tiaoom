# Tiaoom 项目 Code Wiki

## 目录

1. [项目概述](#项目概述)
2. [整体架构](#整体架构)
3. [核心类库 (lib/)](#核心类库-lib)
4. [后端系统 (game/backend/)](#后端系统-gamebackend)
5. [前端系统 (game/frontend/)](#前端系统-gamefrontend)
6. [鱼油大战游戏模块](#鱼油大战游戏模块)
7. [数据持久化](#数据持久化)
8. [依赖关系图](#依赖关系图)
9. [项目运行方式](#项目运行方式)
10. [扩展开发指南](#扩展开发指南)

---

## 项目概述

### 项目简介

**Tiaoom** 是一个轻量级的多人在线游戏房间引擎，提供玩家注册登录、房间管理、实时互动等基础能力，并支持可扩展的游戏逻辑接口。

- **项目名称**：tiaoom
- **版本**：0.0.50
- **许可证**：MIT
- **技术栈**：TypeScript + Node.js + Vue 3 + WebSocket

### 核心功能

- ✅ 玩家注册与登录（支持 FishPi / GitHub / Steam / 微信）
- ✅ 多人在线房间管理（创建 / 加入 / 离开 / 踢人 / 转让房主）
- ✅ 房间内玩家实时互动（聊天 / 指令 / 游戏状态同步）
- ✅ 可扩展的游戏逻辑接口（GameRoom 基类继承模式）
- ✅ 游客模式 + 积分系统
- ✅ 游戏记录与成就统计

### 内置游戏

| 游戏名称 | 文件名 | 人数 |
|---------|--------|------|
| 五子棋 | gobang | 2 |
| 四子棋 | connect4 | 2 |
| 黑白棋 | othello | 2 |
| 谁是卧底 | spy | 4+ |
| 抢数字 | click | 2+ |
| 斗兽棋 | doushouqi | 2 |
| UNO | uno | 2-10 |
| 斗地主 | doudizhu | 3 |
| 翻转象棋 | chessflip | 2 |
| 中国象棋 | xiangqi | 2 |
| 药丸博弈 | packbattle | 2 |
| 俄罗斯方块 | tetris | 1+ |
| 飞行棋 | aeroplane-chess | 2-4 |
| 跳棋 | chinese-checkers | 2-6 |
| 麻将 | mahjong | 4 |
| 连连看 | link-link | 2 |
| 猜数字 | guess | 2+ |
| 吹牛骰 | liars-dice | 2+ |
| 军棋 | luzhanqi | 2 |
| 点格棋 | dots | 2 |
| **赛博鱼油大逃杀** | fish-oil-battle | 2-8 |

---

## 整体架构

### 分层架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (Vue 3)                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │  Views   │  │ Components│  │  Stores  │  │   Router   │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
│                        ┌──────────────┐                     │
│                        │  GameCore    │                     │
│                        │ (Tiaoom 客户端)│                     │
└────────────────────────┴──────┬───────┴─────────────────────┘
                                │
                        WebSocket 通信
                                │
┌───────────────────────────────┴─────────────────────────────┐
│                       后端 (Node.js)                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    Controller                         │   │
│  │                 (Tiaoom 服务端)                       │   │
│  └───────────────────┬──────────────────────────────────┘   │
│                      │                                       │
│         ┌────────────┴────────────┐                         │
│         │                         │                         │
│  ┌──────▼──────┐          ┌───────▼───────┐                 │
│  │ SocketManager│          │   GameRoom    │                 │
│  │  (WebSocket) │          │  (游戏逻辑基类)│                 │
│  └─────────────┘          └───────┬───────┘                 │
│                                   │                         │
│                          ┌────────▼────────┐                │
│                          │  各游戏实现      │                │
│                          │  (20+ 款游戏)    │                │
│                          └─────────────────┘                │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  Express API │  │   数据持久化  │  │  TypeORM / Redis │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### 目录结构

```
tiaoom/
├── lib/                          # 核心类库（发布为 npm 包）
│   ├── events/                   # 事件定义
│   ├── models/                   # 数据模型
│   ├── client.ts                 # 客户端入口
│   └── index.ts                  # 服务端入口
├── game/                         # 游戏示例（完整前后端）
│   ├── backend/                  # 后端服务
│   │   └── src/
│   │       ├── controller.ts     # 控制器（继承 Tiaoom）
│   │       ├── socket.ts         # WebSocket 管理
│   │       ├── model.ts          # 数据模型层
│   │       ├── games/            # 各游戏逻辑实现
│   │       ├── entities/         # TypeORM 实体
│   │       ├── routes/           # Express 路由
│   │       ├── login/            # 登录策略
│   │       └── utils/            # 工具函数
│   ├── frontend/                 # 前端应用
│   │   └── src/
│   │       ├── core/game.ts      # 游戏核心（继承 Tiaoom 客户端）
│   │       ├── components/       # 游戏组件
│   │       ├── stores/           # Pinia 状态管理
│   │       ├── views/            # 页面视图
│   │       ├── router/           # 路由配置
│   │       └── api/              # API 封装
│   └── embed/                    # 嵌入式 SDK
├── docs/                         # VitePress 文档站点
└── 游戏设计文档/                  # 鱼油大战设计文档
```

---

## 核心类库 (lib/)

### 服务端入口 [index.ts](file:///d:/TraePro/fishoil/tiaoom/lib/index.ts)

#### Tiaoom 类

**核心职责**：服务端游戏引擎主类，管理所有房间和玩家。

**继承**：`EventEmitter`

**主要属性**：

| 属性 | 类型 | 说明 |
|------|------|------|
| `rooms` | `Room[]` | 房间列表 |
| `players` | `Player[]` | 玩家列表 |
| `messageInstance` | `IMessage` | 消息发送实例 |

**核心方法**：

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `run()` | - | `this` | 启动消息监听循环 |
| `createRoom(sender, options)` | `IPlayer, IRoomOptions` | `Promise<Room>` | 创建房间 |
| `joinPlayer(sender, player, isCreator, role)` | `IPlayer, IRoomPlayerOptions, boolean, PlayerRole` | `Promise<RoomPlayer>` | 玩家加入房间 |
| `leavePlayer(sender, player)` | `IPlayer, IRoomPlayerOptions` | `Promise<RoomPlayer>` | 玩家离开房间 |
| `startRoom(sender, room)` | `IPlayer, IRoom` | `Promise<void>` | 开始游戏 |
| `closeRoom(sender, room)` | `IPlayer \| null, IRoom` | `Promise<Room>` | 关闭房间 |
| `searchRoom(room)` | `string \| Partial<IRoomOptions>` | `Room \| undefined` | 搜索房间 |
| `searchPlayer(player)` | `string \| IPlayerOptions` | `Player \| undefined` | 搜索玩家 |
| `send(message)` | `IMessagePackage` | `Promise<void>` | 发送消息 |
| `loadFrom(data)` | `{ rooms?, players? }` | `this` | 从数据加载状态 |
| `toJSON()` | - | `{ rooms, players }` | 导出 JSON 数据 |

**消息处理流程**：

1. 监听 `messageInstance` 的 `message` 事件
2. 根据 `message.type` 分发到对应处理函数
3. 处理完成后通过回调返回结果
4. 发生错误时发送 `PlayerError` 消息

---

### 数据模型

#### 玩家模型 [models/player.ts](file:///d:/TraePro/fishoil/tiaoom/lib/models/player.ts)

**PlayerStatus 枚举**：

```typescript
enum PlayerStatus {
  ready = 'ready',      // 已准备
  unready = 'unready',  // 未准备
  online = 'online',    // 在线
  playing = 'playing',  // 游戏中
  offline = 'offline',  // 离线
}
```

**Player 类**：

| 属性 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 玩家唯一 ID |
| `name` | `string` | 玩家名称 |
| `attributes` | `any` | 自定义属性 |
| `status` | `PlayerStatus` | 玩家状态（带 setter 触发事件） |
| `isAdmin` | `boolean` | 是否管理员 |
| `isVisitor` | `boolean` | 是否游客 |

---

#### 房间模型 [models/room.ts](file:///d:/TraePro/fishoil/tiaoom/lib/models/room.ts)

**PlayerRole 枚举**：

```typescript
enum PlayerRole {
  player = 'player',    // 玩家
  watcher = 'watcher',  // 观众
  admin = 'admin',      // 管理员
}
```

**RoomStatus 枚举**：

```typescript
enum RoomStatus {
  waiting = 'waiting',  // 等待中
  ready = 'ready',      // 已准备
  playing = 'playing',  // 游戏中
}
```

**RoomPlayer 类**（继承 Player）：

| 属性 | 类型 | 说明 |
|------|------|------|
| `isReady` | `boolean` | 是否已准备 |
| `role` | `PlayerRole` | 玩家角色 |
| `isCreator` | `boolean` | 是否房主 |
| `roomId` | `string` | 房间 ID |

**Room 类**：

| 属性 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 房间 ID |
| `name` | `string` | 房间名称 |
| `size` | `number` | 房间容量 |
| `minSize` | `number` | 最小人数 |
| `players` | `RoomPlayer[]` | 玩家列表 |
| `attrs` | `Record<string, any>` | 自定义属性 |

**计算属性**：

| 属性 | 类型 | 说明 |
|------|------|------|
| `validPlayers` | `RoomPlayer[]` | 有效玩家（非观众） |
| `watchers` | `RoomPlayer[]` | 观众列表 |
| `isReady` | `boolean` | 是否满足开始条件 |
| `status` | `RoomStatus` | 房间状态 |
| `isPlaying` | `boolean` | 是否游戏中 |
| `isFull` | `boolean` | 是否已满 |
| `owner` | `RoomPlayer \| undefined` | 房主 |

**核心方法**：

| 方法 | 说明 |
|------|------|
| `addPlayer(player, isCreator, role)` | 添加玩家 |
| `kickPlayer(player)` | 踢出玩家 |
| `leaveSeat(player)` | 离开座位（变为观众） |
| `searchPlayer(player)` | 搜索玩家 |
| `start(sender)` | 开始游戏 |
| `end()` | 结束游戏 |
| `setCreator(player)` | 设置房主 |

---

### 客户端入口 [client.ts](file:///d:/TraePro/fishoil/tiaoom/lib/client.ts)

#### Tiaoom 客户端类

**核心职责**：客户端 SDK，封装连接、消息收发、事件监听。

**主要属性**：

| 属性 | 类型 | 说明 |
|------|------|------|
| `rooms` | `Room[]` | 房间列表缓存 |
| `players` | `Player[]` | 玩家列表缓存 |
| `currentPlayer` | `Player \| null` | 当前登录玩家 |
| `listeners` | `Record<string, Function[]>` | 事件监听器 |

**需子类实现的方法**：

| 方法 | 说明 |
|------|------|
| `connect()` | 连接服务器 |
| `send({ type, data })` | 发送消息 |

**主动操作方法**：

| 方法 | 说明 |
|------|------|
| `login(player)` | 玩家登录 |
| `createRoom(data)` | 创建房间 |
| `joinRoom(roomId, params)` | 加入房间 |
| `leaveRoom(roomId, params)` | 离开房间 |
| `leaveSeat(roomId, params)` | 离开座位 |
| `kickPlayer(roomId, playerId, params)` | 踢出玩家 |
| `transferRoom(roomId, playerId, params)` | 转让房主 |
| `closeRoom(roomId, params)` | 关闭房间 |
| `startGame(id, params)` | 开始游戏 |
| `ready(roomId, isReady, params)` | 准备/取消准备 |
| `command(roomId?, command)` | 发送指令 |

**事件监听方法**：

| 方法 | 事件 | 说明 |
|------|------|------|
| `onReady(cb)` | `sys.ready` | 连接就绪 |
| `onError(cb)` | `global.error` | 全局错误 |
| `onMessage(cb, on)` | `global.message` | 全局消息 |
| `onPlayerList(cb)` | `onPlayerList` | 玩家列表更新 |
| `onRoomList(cb, on)` | `onRoomList` | 房间列表更新 |
| `onPlayerJoin(cb, on)` | `room.join` | 玩家加入 |
| `onPlayerLeave(cb, on)` | `room.leave` | 玩家离开 |
| `onPlayerReady(cb, on)` | `room.player-ready` | 玩家准备 |
| `onPlayerUnready(cb, on)` | `room.player-unready` | 玩家取消准备 |
| `onRoomStart(cb, on)` | `onRoomStart` | 房间开始 |
| `onRoomEnd(cb, on)` | `onRoomEnd` | 房间结束 |
| `onRoomMessage(cb, on)` | `room.message` | 房间消息 |
| `onRoomCommand(cb, on)` | `room.command` | 房间指令 |

---

### 事件系统 [events/](file:///d:/TraePro/fishoil/tiaoom/lib/events/)

**事件层级**：

```
BaseEvents
├── TiaoomEvents (服务端广播)
│   ├── room
│   ├── rooms
│   ├── room-player
│   ├── player
│   ├── players
│   ├── command
│   └── message
├── RoomEvents (房间事件)
│   ├── message
│   ├── command
│   ├── start
│   ├── end
│   ├── join
│   ├── leave
│   ├── player-ready
│   ├── player-unready
│   ├── all-ready
│   └── player-command
└── PlayerEvents (玩家事件)
    ├── command
    ├── message
    └── status
```

---

## 后端系统 (game/backend/)

### 入口 [index.ts](file:///d:/TraePro/fishoil/tiaoom/game/backend/src/index.ts)

**Game 类** - 应用启动类

**启动流程**：

1. 初始化 Express 应用
2. 配置 Session（文件存储）
3. 配置静态资源、JSON 解析、Cookie 解析
4. 创建 HTTP 服务器
5. 初始化数据库连接（TypeORM）
6. 注册 API 路由
7. 创建 Controller（继承 Tiaoom）
8. 启动 WebSocket 服务

**配置项**：

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `PORT` | 27015 | 服务端口 |
| `utils.config.webport` | 27015 | Web 端口 |

---

### 控制器 [controller.ts](file:///d:/TraePro/fishoil/tiaoom/game/backend/src/controller.ts)

#### Controller 类

**继承**：`Tiaoom` (from 'tiaoom')

**核心职责**：

- 扩展 Tiaoom 基类功能
- 管理游戏房间的创建与初始化
- 处理房间密码、积分等业务逻辑
- 集成数据库持久化

**扩展功能**：

| 功能 | 说明 |
|------|------|
| 房间密码 | MD5 加密存储与校验 |
| 积分房间 | 对接 FishPi 积分系统 |
| 管理员判定 | 从数据库查询管理员权限 |
| 游戏初始化 | 根据房间类型创建 GameRoom 实例 |
| 全局广播 | 管理员全局消息广播 |

**重写的方法**：

| 方法 | 扩展内容 |
|------|----------|
| `createRoom()` | 密码加密 + 积分校验 |
| `loginPlayer()` | 登录后推送广播消息 |
| `joinPlayer()` | 密码校验 + 积分房观众限制 |
| `startRoom()` | 积分校验 + 游戏预启动 |
| `isAdmin()` | 数据库查询管理员权限 |

**游戏房间初始化流程**：

```
房间创建
  ↓
检查游戏类型 (room.attrs.type)
  ↓
从 Games 注册表获取游戏模块
  ↓
判断是 GameRoom 子类还是函数式
  ↓
├─ 类模式：new GameClass(room) → gameRoom.init()
└─ 函数模式：defaultExport(room, { save, restore })
  ↓
绑定房间事件监听（join/leave/start/end/command）
```

---

### WebSocket 管理 [socket.ts](file:///d:/TraePro/fishoil/tiaoom/game/backend/src/socket.ts)

#### SocketManager 类

**继承**：`EventEmitter`

**实现**：`IMessage` 接口

**核心职责**：

- 管理 WebSocket 连接
- 消息接收与解析
- 消息分发与发送
- 连接断开处理

**主要属性**：

| 属性 | 类型 | 说明 |
|------|------|------|
| `sockets` | `Array<{ socket, player }>` | 连接列表 |

**核心方法**：

| 方法 | 说明 |
|------|------|
| `constructor(server)` | 创建 WebSocketServer，监听连接 |
| `send(message)` | 向指定玩家发送消息 |
| `close()` | 关闭服务 |

**消息处理流程**：

```
客户端发送消息 (JSON)
  ↓
解析为 { type, data, sender? }
  ↓
type === 'player.login' → 注册 socket-player 映射
  ↓
其他消息 → 查找对应玩家 → 注入 sender
  ↓
emit('message', message, callback)
  ↓
Controller 处理 → callback 返回结果/错误
```

---

### 游戏基类 [games/index.ts](file:///d:/TraePro/fishoil/tiaoom/game/backend/src/games/index.ts)

#### GameRoom 类

**核心职责**：所有游戏房间逻辑的基类，提供通用游戏能力。

**主要属性**：

| 属性 | 类型 | 说明 |
|------|------|------|
| `room` | `Room` | 房间实例 |
| `messageHistory` | `IRoomMessage[]` | 消息历史（最近 100 条） |
| `achievements` | `Record<string, IRoomAchievement>` | 成就数据 |
| `publicCommands` | `string[]` | 观众可使用的指令 |
| `tickTimeout` | `Record<string, Timeout>` | 计时器集合 |
| `tickEndTime` | `Record<string, number>` | 计时器结束时间 |
| `beginTime` | `number` | 游戏开始时间戳 |

**核心方法**：

| 方法 | 说明 |
|------|------|
| `init()` | 初始化房间事件监听 |
| `onStart()` | 游戏开始钩子（子类重写） |
| `onCommand(message)` | 指令处理（子类扩展） |
| `onSay(message)` | 聊天处理 |
| `getStatus(sender)` | 获取玩家状态（断线重连用） |
| `save()` | 保存游戏数据 |
| `getData()` | 获取本局数据（存记录用） |
| `say(message, sender?)` | 房间内发消息 |
| `sayTo(message, receiver)` | 私信玩家 |
| `command(type, data, sender?)` | 广播指令 |
| `commandTo(type, data, receiver)` | 私信指令 |
| `saveAchievements(winners?)` | 保存成就 + 积分结算 |
| `saveRecord(winners, score?)` | 保存游戏记录 |
| `startTimer(callback, ms, name)` | 启动倒计时 |
| `stopTimer(name?)` | 停止计时器 |
| `restoreTimer(timer)` | 恢复计时器 |

**事件监听**（init 中绑定）：

| 事件 | 处理 |
|------|------|
| `player-command` | 分发到 onCommand |
| `start` | 调用 onStart + 扣积分 |
| `end` | 广播 end 指令 + 保存 |
| `message` | 记录消息历史 |
| `player-ready/unready` | 保存状态 |
| `join/leave` | 保存状态 |
| `close` | 清理计时器 |

#### 游戏注册机制

**自动加载**：使用 `glob` 扫描 `games/` 目录下的所有 `.ts/.js` 文件，动态 import 并注册。

**游戏模块导出规范**：

```typescript
// 必须导出
export const name = '游戏名称';
export const minSize = 2;        // 最小人数
export const maxSize = 8;        // 最大人数
export const description = '游戏描述';

// 默认导出 - 两种模式二选一
// 模式一：GameRoom 子类
export default class MyGame extends GameRoom { ... }

// 模式二：函数式
export default function(room: Room, methods: IGameMethod) { ... }
```

---

### 登录系统 [login/](file:///d:/TraePro/fishoil/tiaoom/game/backend/src/login/)

| 登录方式 | 文件 | 说明 |
|---------|------|------|
| FishPi | fishpi.ts | 摸鱼派社区账号 |
| GitHub | github.ts | GitHub OAuth |
| Steam | steam.ts | Steam OpenID |
| 微信 | wechat.ts | 微信登录 |

---

### API 路由 [routes/](file:///d:/TraePro/fishoil/tiaoom/game/backend/src/routes/)

| 路由文件 | 前缀 | 说明 |
|---------|------|------|
| api.ts | `/api` | 主要 API（用户、房间、记录等） |
| config.ts | `/config` | 初始化配置向导 |
| embed.ts | `/embed` | 嵌入式页面 |
| game.ts | `/game` | 游戏相关接口 |

---

## 前端系统 (game/frontend/)

### 技术栈

- **框架**：Vue 3 + TypeScript
- **构建工具**：Vite
- **状态管理**：Pinia
- **路由**：Vue Router
- **样式**：Tailwind CSS
- **WebSocket**：ReconnectingWebSocket

### 入口 [main.ts](file:///d:/TraePro/fishoil/tiaoom/game/frontend/src/main.ts)

**启动流程**：

1. 创建 Vue 应用
2. 注册 Router
3. 注册游戏组件
4. 注册 Pinia Store
5. 挂载到 `#app`

---

### 游戏核心 [core/game.ts](file:///d:/TraePro/fishoil/tiaoom/game/frontend/src/core/game.ts)

#### GameCore 类

**继承**：`Tiaoom` (from 'tiaoom/client')

**核心职责**：前端 WebSocket 连接管理与消息收发。

**主要属性**：

| 属性 | 类型 | 说明 |
|------|------|------|
| `address` | `string` | WebSocket 地址 |
| `socket` | `ReconnectingWebSocket` | 重连 WebSocket 实例 |

**实现的方法**：

| 方法 | 说明 |
|------|------|
| `connect()` | 创建 WebSocket 连接，绑定事件 |
| `send({ type, data })` | 发送 JSON 消息 |
| `close()` | 关闭连接 |

**扩展方法**：

| 方法 | 说明 |
|------|------|
| `say(message, roomId?)` | 发送聊天消息 |
| `init(roomId, player)` | 初始化游戏状态 |
| `onCommand(cb, on)` | 监听指令（玩家+房间） |
| `onPlayMessage(cb, on)` | 监听消息（玩家+房间） |
| `getRoomOneTime(roomId)` | 一次性获取房间信息 |

---

### 状态管理 [stores/game.ts](file:///d:/TraePro/fishoil/tiaoom/game/frontend/src/stores/game.ts)

#### useGameStore

**Pinia Store**，管理全局游戏状态。

**状态**：

| 状态 | 类型 | 说明 |
|------|------|------|
| `game` | `GameCore \| null` | 游戏核心实例 |
| `player` | `User \| null` | 当前用户 |
| `players` | `Player[]` | 在线玩家列表 |
| `rooms` | `Room[]` | 房间列表 |
| `games` | `Record<string, GameConfig>` | 游戏配置 |
| `globalMessages` | `Array` | 全局聊天记录 |
| `roomPlayer` | `Computed` | 当前玩家在房间中的信息 |

**核心方法**：

| 方法 | 说明 |
|------|------|
| `initConfig()` | 加载游戏配置 |
| `checkSession()` | 检查登录状态 |
| `initGame()` | 初始化 GameCore 并连接 |
| `login(name)` | 用户名登录 |
| `loginVisitor()` | 游客登录 |
| `logout()` | 登出 |

---

### 组件结构 [components/](file:///d:/TraePro/fishoil/tiaoom/game/frontend/src/components/)

```
components/
├── common/                    # 通用组件
│   ├── GameView.vue           # 游戏视图容器
│   ├── GameChat.vue           # 游戏聊天
│   ├── PlayerList.vue         # 玩家列表
│   ├── CreateRoom.vue         # 创建房间
│   ├── LoginModal.vue         # 登录弹窗
│   ├── RoomControls.vue       # 房间控制
│   ├── RulesModal.vue         # 规则弹窗
│   └── ThemeController.vue    # 主题切换
├── msg/                       # 消息提示
├── msgbox/                    # 对话框
├── fish-oil-battle/           # 鱼油大战（最复杂）
│   ├── FishOilBattleRoom.vue  # 房间主组件
│   ├── FishOilBattleCanvas.vue # Canvas 渲染容器
│   ├── useFishOilBattle.ts    # 战斗状态 composable
│   ├── renderer/              # Canvas 渲染器
│   └── components/            # UI 子组件
└── [其他游戏]/                 # 各游戏独立组件
```

**每个游戏的标准组件**：

- `XxxRoom.vue` - 房间主组件
- `XxxLite.vue` - 轻量预览组件
- `XxxReplay.vue` - 回放组件
- `useXxx.ts` - 游戏状态 composable

---

### 视图页面 [views/](file:///d:/TraePro/fishoil/tiaoom/game/frontend/src/views/)

| 页面 | 路径 | 说明 |
|------|------|------|
| Home.vue | `/` | 首页（大厅） |
| Room.vue | `/r/:id` | 房间页面 |
| Login.vue | `/login` | 登录页 |
| Profile.vue | `/profile` | 个人资料 |
| Leaderboard.vue | `/leaderboard` | 排行榜 |
| Replay.vue | `/replay` | 回放页 |
| Lite.vue | `/lite` | 轻量模式 |
| Admin.vue | `/admin` | 管理后台 |
| Config.vue | `/config` | 配置向导 |

---

## 鱼油大战游戏模块

> 本项目中最复杂、架构最完善的游戏模块，位于 `game/backend/src/games/fish-oil-battle/` 和 `game/frontend/src/components/fish-oil-battle/`

### 模块概述

**游戏名称**：赛博鱼油大逃杀

**游戏类型**：2D 弹球竞技 + 技能武器系统

**支持人数**：2-8 人

**游戏时长**：约 90 秒/局

**核心玩法**：
1. 武器选择阶段（15 秒）：三选一武器
2. 战斗阶段（90 秒）：20fps 物理模拟 + 武器技能自动触发
3. 结算阶段：统计伤害、击杀、存活时间等

---

### 后端架构

```
fish-oil-battle/
├── index.ts                    # 模块入口 + 导出
├── FishOilRoom.ts              # 房间主逻辑（继承 GameRoom）
├── BotPlayer.ts                # Bot 玩家
├── config/
│   ├── GameEnums.ts           # 枚举定义
│   └── WeaponRangeConfig.ts    # 武器射程配置
├── core/
│   ├── IWeapon.ts             # 武器接口定义
│   ├── WeaponRegistry.ts      # 武器注册中心（工厂模式）
│   ├── WeaponScheduler.ts     # 武器调度器
│   ├── SkillScheduler.ts      # 旧版技能调度器
│   └── types.ts               # 战斗状态类型
├── physics/
│   ├── PhysicsEngine.ts       # 物理引擎
│   └── PhysicsAdapter.ts      # 物理查询适配器
├── shared/
│   └── protocol.ts            # 前后端共享协议类型
├── skills/
│   └── weapons/               # 武器实现（11+ 把）
│       ├── ShockwaveGeneratorWeapon.ts
│       ├── FirewallProtocolWeapon.ts
│       ├── HiveMotherWeapon.ts
│       ├── OpticalSlashWeapon.ts
│       ├── AirRepulsionFieldWeapon.ts
│       ├── EntropicTouchWeapon.ts
│       ├── DrawingManifestWeapon.ts
│       ├── DischargeCatWeapon.ts
│       ├── PrecognitiveLensWeapon.ts
│       ├── EmotionalWeatherWeapon.ts
│       └── EmotionMasteryWeapon.ts
└── systems/
    └── GlobalEffectSystem.ts  # 全局彩蛋效果系统
```

---

#### 房间主逻辑 [FishOilRoom.ts](file:///d:/TraePro/fishoil/tiaoom/game/backend/src/games/fish-oil-battle/FishOilRoom.ts)

**FishOilRoom 类**（继承 GameRoom）

**游戏阶段**：

```
weapon_select (武器选择)
    ↓ 15s / 全部确认
battle (战斗中)
    ↓ 90s / 剩 1 人
ended (结算)
```

**主要属性**：

| 属性 | 类型 | 说明 |
|------|------|------|
| `battleState` | `BattleState` | 战斗状态 |
| `physics` | `PhysicsEngine` | 物理引擎 |
| `scheduler` | `WeaponScheduler` | 武器调度器 |
| `physicsAdapter` | `PhysicsAdapter` | 物理查询适配器 |
| `phase` | `'weapon_select' \| 'battle' \| 'ended'` | 游戏阶段 |
| `weaponSelections` | `Record<string, string>` | 玩家武器选择 |
| `deadPlayers` | `Set<string>` | 死亡玩家集合 |
| `roundSecondsRemaining` | `number` | 剩余时间 |
| `battleTick` | `number` | 当前 tick 计数 |

**核心方法**：

| 方法 | 说明 |
|------|------|
| `onStart()` | 游戏开始 → 武器选择阶段 |
| `startBattle()` | 开始战斗 → 启动 tick loop |
| `battleTickLoop()` | 每 50ms 执行一次 |
| `endBattle(winners)` | 结束战斗 → 结算 |
| `handleSelectWeapon()` | 处理武器选择 |
| `broadcastGameState()` | 广播游戏状态（20fps） |
| `extractVisualEvents()` | 提取视觉事件 |
| `computeArenaConfig(playerCount)` | 动态计算竞技场配置 |
| `computeSpawnPositions(count, ...)` | 计算出生位置 |

**战斗 tick 流程**：

```
每 50ms 执行一次：
  1. 设置动态障碍物到物理引擎
  2. 物理引擎推进 (dt=0.05s)
  3. 同步物理位置到 BattleState
  4. 处理碰撞 → 武器系统
     - 球球碰撞 → processHit 双向
     - 墙壁碰撞 → processWallHit
     - 障碍物碰撞 → processObstacleHit
  5. WeaponScheduler.tick() 驱动所有武器
  6. 全局彩蛋效果处理（可选）
  7. 检查爆发能量 → 自动爆发
  8. 检查死亡 → 移除死球
  9. 广播 game_state
  10. 发送 visual_event
  11. 大逃杀胜负判定
```

---

#### 物理引擎 [physics/PhysicsEngine.ts](file:///d:/TraePro/fishoil/tiaoom/game/backend/src/games/fish-oil-battle/physics/PhysicsEngine.ts)

**PhysicsEngine 类**

**核心职责**：2D 弹球物理模拟。

**配置参数**：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `baseSpeed` | 200 px/s | 基准速率 |
| `restitution` | 0.9 | 弹性系数 |
| `ballRadius` | 40 px | 碰撞半径 |
| `arenaRadius` | 280 px | 竞技场半径 |

**支持的竞技场形状**：

| 形状 | 枚举值 | 说明 |
|------|--------|------|
| 圆形 | `ArenaShape.CIRCLE` | 圆形边界反弹 |
| 矩形 | `ArenaShape.RECT` | AABB 边界 |
| 六边形 | `ArenaShape.HEXAGON` | 正六边形边界 |

**碰撞类型**：

| 类型 | 说明 |
|------|------|
| `wall` | 竞技场边界碰撞 |
| `ball` | 球球碰撞 |
| `obstacle` | 动态障碍物碰撞 |

**核心方法**：

| 方法 | 说明 |
|------|------|
| `addBall(id, x, y, vx?, vy?)` | 添加小球 |
| `removeBall(id)` | 移除小球 |
| `getBall(id)` | 获取小球状态 |
| `getAllBalls()` | 获取所有小球 |
| `tick(dt)` | 推进一帧物理，返回碰撞事件 |
| `setObstacles(obs)` | 设置动态障碍物 |
| `modifyBallSpeed(id, newSpeed, newAngle?)` | 修改小球速度 |

**碰撞响应特点**：
- 弹性碰撞后恢复原速率（速度大小不变，仅改变方向）
- 速度大小只能由技能效果修改

---

#### 武器系统

##### 武器接口 [core/IWeapon.ts](file:///d:/TraePro/fishoil/tiaoom/game/backend/src/games/fish-oil-battle/core/IWeapon.ts)

**IWeapon 接口**

**生命周期钩子**：

| 钩子 | 触发时机 | 说明 |
|------|----------|------|
| `onTick(state, physics)` | 每 tick | 常驻被动 + 自动触发检测 |
| `onHitTarget(state, physics)` | 碰撞到对手时 | 攻击方触发 |
| `onHitByAttacker(attackerId, state, physics)` | 被对手碰撞时 | 防守方触发 |
| `onWallHit(state, physics)` | 碰墙时（可选） | 墙壁碰撞触发 |
| `onObstacleHit(hittingPlayerId, state, physics)` | 障碍物被碰时（可选） | 障碍物碰撞伤害 |

**能量/爆发系统**：

| 方法 | 说明 |
|------|------|
| `getEnergy()` | 获取当前能量 |
| `getMaxEnergy()` | 获取最大能量 |
| `isBurstReady()` | 是否可爆发 |
| `burst(state, physics)` | 执行爆发，返回效果 |

**WeaponEffect 类型**：

| 效果类型 | 说明 |
|----------|------|
| `DAMAGE` | 单体伤害 |
| `AOE_DAMAGE` | 范围伤害 |
| `BURST_DAMAGE` | 爆发伤害 |
| `DOT` | 持续伤害（DPS） |
| `SLOW` | 减速效果 |
| `HEAL` | 治疗 |
| `SPAWN_FIELD` | 生成场地效果（防火墙等） |
| `SPAWN_PROJECTILE` | 生成投射物 |
| `VISUAL_ONLY` | 仅视觉效果 |

---

##### 武器注册中心 [core/WeaponRegistry.ts](file:///d:/TraePro/fishoil/tiaoom/game/backend/src/games/fish-oil-battle/core/WeaponRegistry.ts)

**工厂模式 + 注册表**

**核心函数**：

| 函数 | 说明 |
|------|------|
| `createWeapon(id)` | 根据 ID 创建武器实例 |
| `getWeaponMetaList()` | 获取所有武器元信息 |
| `getImplementedWeaponMetaList()` | 获取已实现的武器（排除 Stub） |

**武器流派（School）**：

| 流派 | 颜色 | 代表武器 |
|------|------|----------|
| AGGRESSOR (侵略者) | #FF00FF 品红 | 冲击波发生器、光学斩击 |
| CONTROLLER (控制者) | #00BFFF 深天蓝 | 防火墙协议、熵寂扩散器 |
| ENGINEER (工程师) | #39FF14 霓虹绿 | 蜂巢母体、堡垒建造师 |
| WILD (变奏者) | #FFD700 金色 | 空气斥力场、预知透镜、情绪天气 |

**已实现武器列表**（11 把）：

| 武器 ID | 名称 | 流派 | 难度 |
|---------|------|------|------|
| SHOCKWAVE_GENERATOR | 冲击波发生器 | AGGRESSOR | 2 |
| FIREWALL_PROTOCOL | 防火墙协议 | CONTROLLER | 1 |
| HIVE_MOTHER | 蜂巢母体 | ENGINEER | 2 |
| OPTICAL_SLASH | 光学斩击 | AGGRESSOR | 2 |
| AIR_REPULSION_FIELD | 空气斥力场 | WILD | 1 |
| ENTROPIC_TOUCH | 熵寂之触 | WILD | 2 |
| DRAWING_MANIFEST | 画作实体化 | WILD | 2 |
| DISCHARGE_CAT | 放电猫猫 | WILD | 2 |
| PRECOGNITIVE_LENS | 预知透镜 | WILD | 3 |
| EMOTIONAL_WEATHER | 情绪天气 | WILD | 2 |
| EMOTION_MASTERY | 情绪掌控 | WILD | 2 |

**新增武器流程**：
1. 在 `skills/weapons/` 下创建类，实现 `IWeapon` 接口
2. 在 `WeaponRegistry.ts` 的 `REGISTRY` 中添加一行
3. 完成！核心系统零改动

---

##### 武器调度器 [core/WeaponScheduler.ts](file:///d:/TraePro/fishoil/tiaoom/game/backend/src/games/fish-oil-battle/core/WeaponScheduler.ts)

**WeaponScheduler 类**

**核心职责**：管理所有武器的生命周期调度。

**主要属性**：

| 属性 | 类型 | 说明 |
|------|------|------|
| `bindings` | `Map<string, IWeapon>` | 玩家-武器绑定 |
| `physicsQuery` | `IPhysicsQuery` | 物理查询接口 |
| `pendingVisuals` | `PendingVisualEvent[]` | 待广播视觉事件 |
| `damageModifier` | `Function \| null` | 外部伤害修正回调 |

**核心方法**：

| 方法 | 说明 |
|------|------|
| `register(playerId, weapon)` | 注册玩家武器 |
| `getWeapon(playerId)` | 获取玩家武器 |
| `tick(state)` | 每 tick 调度所有武器 |
| `processHit(attackerId, targetId, state)` | 处理碰撞 |
| `processWallHit(playerId, state)` | 处理碰墙 |
| `processObstacleHit(obstacleSourceId, hittingPlayerId, state)` | 处理障碍物碰撞 |
| `forceBurst(playerId, state)` | 手动触发爆发 |
| `getObstacles()` | 获取所有武器的物理障碍物 |
| `getVisualEvents()` | 获取并清空视觉事件 |

**tick 调度顺序**：

```
1. 遍历所有存活玩家武器 → onTick()
2. 收集所有 WeaponEffect
3. applyWeaponEffects() 应用效果
   ├─ VISUAL_ONLY → 加入 pendingVisuals
   ├─ 伤害类 → 调用 damageModifier 修正 → state.applyDamage()
   └─ 持续类 (DOT/SLOW/SPAWN_FIELD) → 加入 activeEffects
4. 每秒清理过期效果（duration--）
5. state.tick++
```

---

#### 战斗状态 [core/SkillScheduler.ts](file:///d:/TraePro/fishoil/tiaoom/game/backend/src/games/fish-oil-battle/core/SkillScheduler.ts)

**BattleState 类**

**PlayerState 属性**：

| 属性 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 玩家 ID |
| `name` | `string` | 玩家名称 |
| `hp` | `number` | 当前生命值 |
| `maxHp` | `number` | 最大生命值 |
| `position` | `{ x, y }` | 位置 |
| `damageDealt` | `number` | 造成总伤害 |
| `totalDamageTaken` | `number` | 承受总伤害 |
| `kills` | `number` | 击杀数 |
| `deaths` | `number` | 死亡数 |
| `maxHit` | `number` | 最大单次伤害 |
| `weaponTriggers` | `number` | 武器触发次数 |
| `bursts` | `number` | 爆发次数 |
| `isOverheated` | `boolean` | 是否过热 |

**核心方法**：

| 方法 | 说明 |
|------|------|
| `addPlayer(playerData)` | 添加玩家 |
| `getPlayer(id)` | 获取玩家状态 |
| `applyDamage(targetId, damage, sourceId)` | 应用伤害 |
| `heal(targetId, amount, sourceId)` | 治疗 |

---

### 前端渲染架构

```
fish-oil-battle/
├── FishOilBattleRoom.vue       # 房间主组件（容器）
├── FishOilBattleCanvas.vue     # Canvas 渲染容器
├── useFishOilBattle.ts         # 战斗状态管理 composable
├── WeaponRangeConfig.ts        # 武器射程配置
├── components/                 # UI 组件
│   ├── BattleHudPanel.vue      # HUD 面板
│   ├── BattleResultOverlay.vue # 结算弹窗
│   ├── BattleStatsModal.vue    # 统计详情
│   ├── WeaponSelectOverlay.vue # 武器选择
│   └── ...
└── renderer/                   # Canvas 渲染器
    ├── CyberFishRenderer.ts    # 主渲染器
    ├── GlobalEffectRenderer.ts # 全局效果渲染
    ├── constants.ts            # 渲染常量
    ├── entities/               # 特效渲染器
    │   ├── PlayerRenderer.ts
    │   ├── EffectRenderer.ts
    │   ├── ShockwaveEffectRenderer.ts
    │   ├── FirewallEffectRenderer.ts
    │   ├── HiveEffectRenderer.ts
    │   └── ... (各武器特效)
    └── systems/                # 渲染子系统
        ├── ArenaRenderer.ts    # 竞技场渲染
        ├── ShapeRenderer.ts    # 形状渲染
        ├── ParticlePool.ts     # 粒子池
        ├── PhysicsSystem.ts    # 前端物理预测
        └── ShapeEffectPool.ts  # 形状特效池
```

#### 战斗状态 composable [useFishOilBattle.ts](file:///d:/TraePro/fishoil/tiaoom/game/frontend/src/components/fish-oil-battle/useFishOilBattle.ts)

**核心职责**：管理前端战斗状态，处理 WebSocket 事件。

**状态分类**：

| 阶段 | 状态 |
|------|------|
| 武器选择 | `showWeaponSelect`, `weaponPool`, `selectedWeaponId`, `selectCountdown`, `isWeaponConfirmed` |
| 战斗中 | `battleHudVisible`, `selfHud`, `otherPlayerHuds`, `roundTimer` |
| 结算 | `winnerName`, `winnerPlayerId`, `isDraw`, `endReason` |

**事件处理**：

| 事件 | 处理函数 | 说明 |
|------|----------|------|
| `battle_start` | `onBattleStart()` | 进入武器选择阶段 |
| `weapon_confirmed` | `onWeaponConfirmed()` | 武器确认回调 |
| `round_start` | `onRoundStart()` | 进入战斗阶段 |
| `round_timer` | `onRoundTimer()` | 倒计时更新 |
| `game_state` | `onGameState()` | 游戏状态同步（20fps） |
| `visual_event` | `onVisualEvent()` | 视觉特效事件 |
| `game_end` | `onGameEnd()` | 游戏结束结算 |

---

## 数据持久化

### 持久化层 [model.ts](file:///d:/TraePro/fishoil/tiaoom/game/backend/src/model.ts) + [persistence.ts](file:///d:/TraePro/fishoil/tiaoom/game/backend/src/persistence.ts)

**Model 类** - 静态门面，统一数据访问接口。

**支持的存储驱动**：

| 驱动 | 配置 | 文件 |
|------|------|------|
| MySQL | `persistence.driver: 'mysql'` | TypeORM + RoomSQL |
| MongoDB | `persistence.driver: 'mongodb'` | TypeORM + RoomMongo |
| Redis | `persistence.driver: 'redis'` | ioredis |

**持久化方法**：

| 方法 | 说明 |
|------|------|
| `createRoom(room)` | 创建房间记录 |
| `getRooms()` | 获取所有房间（用于重启恢复） |
| `updatePlayerList(roomId, players)` | 更新玩家列表 |
| `saveGameData(roomId, gameData)` | 保存游戏状态数据 |
| `getGameData(roomId)` | 读取游戏状态数据 |
| `closeRoom(roomId)` | 关闭房间记录 |

---

### 数据库实体 [entities/](file:///d:/TraePro/fishoil/tiaoom/game/backend/src/entities/)

| 实体 | 文件 | 说明 |
|------|------|------|
| User | User.ts | 用户表 |
| UserBind | UserBind.ts | 第三方账号绑定 |
| Room | Room.ts | 房间表（MySQL/Mongo 两种实现） |
| Log | Log.ts | 操作日志 |
| Record | Record.ts | 游戏记录 |
| PlayerStats | PlayerStats.ts | 玩家统计数据 |
| Manage | Manage.ts | 管理配置 |

---

## 依赖关系图

### 核心依赖流向

```
┌─────────────────────────────────────────────────────────┐
│                      前端应用                            │
│  ┌─────────┐    ┌─────────┐    ┌────────────────────┐  │
│  │  Views  │───▶│ Stores  │───▶│   GameCore         │  │
│  └─────────┘    └─────────┘    │ (Tiaoom 客户端)    │  │
│         ┌─────────┐            └─────────┬──────────┘  │
│         │Components│                      │             │
│         └─────────┘                      │             │
└──────────────────────────────────────────┼──────────────┘
                                           │
                                    WebSocket (ws)
                                           │
┌──────────────────────────────────────────┼──────────────┐
│                      后端服务            │              │
│  ┌───────────────────────────────────────▼───────────┐  │
│  │                    Controller                      │  │
│  │                 (Tiaoom 服务端)                    │  │
│  └───────────────┬───────────────────┬───────────────┘  │
│                  │                   │                  │
│      ┌───────────▼──────┐  ┌────────▼────────────┐     │
│      │  SocketManager   │  │     GameRoom        │     │
│      │   (WebSocket)    │  │  (游戏逻辑基类)      │     │
│      └──────────────────┘  └────────┬────────────┘     │
│                                      │                  │
│                           ┌──────────▼──────────┐       │
│                           │   各游戏实现        │       │
│                           │ (gobang/fish-oil/…) │       │
│                           └──────────┬──────────┘       │
│                                      │                  │
│  ┌─────────────┐          ┌─────────▼──────────┐       │
│  │ Express API │          │   Model (持久化)    │       │
│  └─────────────┘          └─────────┬──────────┘       │
│                                     │                  │
│                          ┌──────────▼──────────┐       │
│                          │  TypeORM / Redis    │       │
│                          └─────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

### npm 包依赖

**核心库依赖**：

| 包名 | 用途 |
|------|------|
| `tiaoom` | 游戏引擎核心（本项目发布的包） |
| `express` | Web 框架 |
| `ws` | WebSocket 服务端 |
| `typeorm` | ORM 框架 |
| `mysql2` | MySQL 驱动 |
| `mongodb` | MongoDB 驱动 |
| `ioredis` | Redis 客户端 |
| `vue` | 前端框架 |
| `pinia` | 状态管理 |
| `vue-router` | 路由 |
| `reconnecting-websocket` | WebSocket 重连 |
| `tailwindcss` | CSS 框架 |
| `vite` | 构建工具 |

---

## 项目运行方式

### 环境要求

- Node.js >= 16.x
- npm >= 8.x
- MySQL / MongoDB / Redis（可选，用于数据持久化）

### 安装与启动

#### 1. 安装依赖

```bash
# 进入 game 目录
cd game

# 安装所有依赖（含后端、前端、embed）
npm install
```

#### 2. 开发模式

```bash
# 同时启动后端 + 前端
npm run dev

# 或分别启动
npm run dev:backend   # 后端: http://localhost:27015
npm run dev:frontend  # 前端: http://localhost:5173
```

#### 3. 构建生产版本

```bash
# 构建所有（embed + backend + frontend）
npm run build

# 分别构建
npm run build:backend
npm run build:frontend
npm run build:embed
```

#### 4. 使用 VS Code 调试

直接按 `F5` 启动调试（已配置 `.vscode/launch.json`）。

### 配置说明

首次启动时，系统会自动进入配置向导（访问 `http://localhost:27015/config`），配置以下内容：

- 数据库连接信息
- Session 密钥
- 管理员账号
- 第三方登录配置（FishPi / GitHub / Steam / 微信）

配置文件保存路径：`game/backend/config.json`

---

## 扩展开发指南

### 新增游戏

#### 后端部分

在 `game/backend/src/games/` 下创建 `mygame.ts`：

```typescript
import { Room, RoomPlayer } from 'tiaoom';
import { GameRoom, IGameCommand } from './index';

export const name = '我的游戏';
export const minSize = 2;
export const maxSize = 4;
export const description = '游戏描述';

export default class MyGame extends GameRoom {
  // 游戏状态
  private gameData: any = {};

  onStart() {
    // 游戏开始逻辑
    this.say('游戏开始！');
    this.command('game_start', { /* 初始数据 */ });
  }

  onCommand(message: IGameCommand) {
    super.onCommand(message); // 必须调用，处理 say/status 等通用指令
    
    switch (message.type) {
      case 'my_action':
        this.handleMyAction(message.sender, message.data);
        break;
    }
  }

  private handleMyAction(sender: RoomPlayer, data: any) {
    // 处理玩家操作
    this.command('action_result', { /* 结果数据 */ });
    this.save();
  }

  getData() {
    // 返回游戏记录数据
    return this.gameData;
  }
}
```

#### 前端部分

在 `game/frontend/src/components/` 下创建 `mygame/MyGameRoom.vue`：

```vue
<template>
  <div class="my-game">
    <!-- 游戏 UI -->
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { useGameStore } from '@/stores/game';

const gameStore = useGameStore();
const roomPlayer = computed(() => gameStore.roomPlayer);

function sendCommand(type: string, data?: any) {
  gameStore.game?.command(roomPlayer.value!.room.id, { type, data });
}

function onCommand(command: any) {
  switch (command.type) {
    case 'game_start':
      // 处理游戏开始
      break;
    case 'action_result':
      // 处理操作结果
      break;
  }
}

onMounted(() => {
  gameStore.game?.onRoomCommand(onCommand);
});

onUnmounted(() => {
  gameStore.game?.onRoomCommand(onCommand, false);
});
</script>
```

#### 注册组件

在 `game/frontend/src/components/index.ts` 中注册。

---

### 新增鱼油大战武器

1. **创建武器类**：在 `skills/weapons/` 下创建 `MyWeapon.ts`，实现 `IWeapon` 接口
2. **注册武器**：在 `WeaponRegistry.ts` 的 `REGISTRY` 中添加条目
3. **前端渲染器**：在 `renderer/entities/` 下创建对应特效渲染器
4. **添加视觉事件处理**：在 `useFishOilBattle.ts` 的 `onVisualEvent` 中添加 case

---

## 关键设计模式

| 模式 | 应用场景 |
|------|----------|
| 模板方法模式 | GameRoom 基类定义游戏生命周期，子类重写钩子 |
| 工厂模式 | WeaponRegistry 创建武器实例 |
| 策略模式 | 不同武器实现 IWeapon 接口，可互换 |
| 观察者模式 | EventEmitter 事件驱动架构 |
| 适配器模式 | PhysicsAdapter 解耦武器与物理引擎 |
| 单例模式 | Controller / GameCore |
| 组合模式 | 武器效果组合（WeaponEffect 数组） |

---

## 性能优化点

1. **物理引擎**：20fps tick 而非 60fps，平衡体验与性能
2. **状态同步**：20fps game_state 广播，高频但轻量
3. **事件节流**：计时器每 5 秒或最后 10 秒才广播
4. **对象池**：前端粒子系统 / 形状特效使用对象池复用
5. **增量更新**：游戏状态全量广播，依靠 WebSocket 低延迟
6. **断线重连**：`getStatus()` 方法支持玩家重连后恢复状态
