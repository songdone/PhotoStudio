/** Templates and labels used by the file workflows, start screen, and command search. */
export const fileUIEntries = `
View all {count}	查看全部 {count} 项
just now	刚刚
{count} min ago	{count} 分钟前
{count} hr ago	{count} 小时前
{count} day ago	{count} 天前
{count} days ago	{count} 天前
Describe the edit first.	请先描述要进行的编辑。
Select three or more layers to distribute.	请选择至少三个图层进行分布。
Align several layers to the canvas instead of to their combined bounds	将多个图层与画布对齐，而不是与其合并边界对齐
Click a shortcut field (or press Enter on it) and press the new key combination; Escape stops recording. Backspace clears it. Conflicts are shown in red.	点击快捷键字段（或按 Enter），然后按下新的组合键。按 Escape 停止录入，按 Backspace 清除快捷键。冲突会以红色显示。
Shortcut for {name}	{name} 的快捷键
Keyboard shortcuts updated.	已更新键盘快捷键。
This browser could not store them (its storage is full or turned off), so they last until the page is closed.	浏览器存储空间已满或已关闭，快捷键设置只能保留到页面关闭时。
This file has {count} pages	此文件共有 {count} 页
This file has {count} frames	此文件共有 {count} 帧
Save as {format}	另存为 {format}
This document cannot be saved as {format}.	此文档无法保存为 {format}。
{format} stores one flattened image.	{format} 只保存拼合后的一张图像。
A .photo project leaves {name} unchanged.	另存为 .photo 项目不会改动原文件“{name}”。
{format} flattens {features} into pixels.	{format} 会将以下内容栅格化：{features}。
{format} leaves out {features}.	{format} 不会保留以下内容：{features}。
{features} of {name}	“{name}”中的{features}
{features} adjustments	{features}调整
unsupported	不受支持的
Indexed	索引颜色
the {mode} color mode (written as RGB)	{mode} 色彩模式（导出为 RGB）
{from}-bit color (written as {to}-bit)	{from} 位颜色（导出为 {to} 位）
{name} could not be opened: {error}	无法打开“{name}”：{error}
{name} is no longer at {path} and was removed from Open Recent.	“{name}”已不在 {path}，已从最近打开列表中移除。
{name} is no longer stored in this browser and was removed from Open Recent. Open it again from its location.	此浏览器不再保存“{name}”，已从最近打开列表中移除。请从文件的原位置重新打开。
`.trim();
