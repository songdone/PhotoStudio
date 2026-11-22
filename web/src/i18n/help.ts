export const helpEntries = `
Brush diameter in pixels. [ makes it smaller, ] larger	画笔直径（像素）。按 [ 缩小，按 ] 放大
Edge hardness: 0% is soft, 100% sharp. Shift+[ softer, Shift+] harder	边缘硬度：0% 为柔和，100% 为锐利。按 Shift+[ 减小硬度，Shift+] 增加硬度
Most a stroke can cover. Number keys: 1 = 10% … 0 = 100%; two digits quickly for an exact value	单次描边的最大覆盖度。数字键 1 = 10%…0 = 100%；快速输入两位数字可精确设置
How fast paint builds up while you drag over an area. Shift+number keys	拖动时颜料累积的速度。可使用 Shift+数字键设置
How the paint blends with the pixels below	绘画颜色与下方像素的混合方式
Steadies the stroke; higher values follow the pointer more loosely	稳定描边；数值越高，描边跟随指针越平缓
Strength of the effect per stroke	每次描边的效果强度
Tones the tool changes most	工具主要调整的色调范围
How much the saturation changes per stroke	每次描边的饱和度变化量
Keeps hues from shifting and clipping while dodging or burning	减淡或加深时防止色相偏移和颜色溢出
Remove or add color saturation	减少或增加颜色饱和度
Size of the pattern relative to its definition	相对于原始图案的大小
Continue the pattern across strokes instead of restarting it at each stroke	在连续描边之间延续图案位置
Keep the source moving with the brush between strokes; off restarts at the source	使取样源随画笔移动；关闭时每次描边从源位置重新开始
Which layers the source pixels are taken from	取样源像素的图层范围
Combination of wetness, load and mix	潮湿、载入量与混合的组合
Shape of the strokes painted from the source state	从源状态绘制的描边形状
When the color to erase is sampled: continuously, at the first click, or from the background color	要擦除颜色的取样时机：连续、首次点击或使用背景色
How different a color can be from the sampled one and still be erased	颜色与取样颜色的最大差异，范围内的颜色会被擦除
How different a color can be from the sampled one and still be replaced	颜色与取样颜色的最大差异，范围内的颜色会被替换
Softens the edge of new selections by this many pixels	按此像素数柔化新选区的边缘
Smooths the jagged edges of curved selections	平滑曲线选区的锯齿边缘
Draw freely, with a fixed aspect ratio, or at a fixed size	自由绘制、使用固定比例或固定大小
Width (or width ratio) of the marquee	选框的宽度（或宽度比例）
Height (or height ratio) of the marquee	选框的高度（或高度比例）
How different a color can be from the clicked one and still be included (0–255)	与点击颜色允许的最大差异（0–255）
Only select connected areas; off selects the color everywhere	仅选择相邻区域；关闭时选择图像中所有相似颜色
Sample the merged visible layers instead of the current layer	对合并后的可见图层取样
Draw a rectangle or a lasso around the object	在对象周围绘制矩形或套索
Average of the pixels around the click	点击位置周围像素的平均值
Average of the pixels around each sampler	各取样点周围像素的平均值
Sample the current layer, the current layer and those below it, or all layers, optionally without adjustment layers	对当前图层、当前及下方图层或所有图层取样，也可排除调整图层
Compare with the clicked pixel or the average of the pixels around it	与点击像素或周围像素的平均值比较
How the spot is replaced	污点的替换方式
Blend the patch with its surroundings or fill it from the context	将修补区域与周围混合，或使用内容识别填充
Apply after each stroke; off waits until you commit	每次描边后应用；关闭时等待确认
Move the selected area or extend it by copying	移动所选区域，或通过复制扩展区域
How closely the result keeps the original shapes (1–7)	结果保留原形状的程度（1–7）
How much colors are blended with the surroundings (0–10)	颜色与周围环境混合的程度（0–10）
Size of the pupil relative to the eye	瞳孔相对于眼睛的大小
How dark the corrected pupil becomes	校正后瞳孔的深色程度
Fill with the foreground color or the current pattern	使用前景色或当前图案填充
Opacity of the fill. Number keys set it	填充不透明度，可用数字键设置
How the gradient blends with the pixels below	渐变与下方像素的混合方式
Opacity of the gradient. Number keys set it	渐变不透明度，可用数字键设置
Swap the start and end colors	交换起始和结束颜色
Add slight noise to prevent banding	添加少量杂色以避免色带
Use the transparency stops of the gradient	使用渐变的不透明度色标
How colors are interpolated between stops	色标之间的颜色插值方式
Draw a shape layer, a path, or pixels	绘制形状图层、路径或像素
How a new shape combines with the existing ones	新形状与现有形状的组合方式
Width of the selected shape	所选形状的宽度
Height of the selected shape	所选形状的高度
Thickness of the line	线条粗细
Corner radius	圆角半径
Number of sides (or points of a star)	边数（或星形角数）
Round the inner corners of stars	将星形内角设为圆角
Arrowhead at the start of the line	在线条起点添加箭头
Arrowhead at the end of the line	在线条终点添加箭头
Draw a shape layer or a path	绘制形状图层或路径
How a new path combines with the existing ones	新路径与现有路径的组合方式
Preview the next segment while moving the pointer	移动指针时预览下一条线段
Click a segment to add an anchor point, or an anchor point to delete it	点击线段添加锚点，点击锚点将其删除
How closely the freeform path follows the pointer	自由路径跟随指针的精确程度
Aspect ratio or size of the crop	裁剪的宽高比或大小
Width part of the aspect ratio	宽高比中的宽度
Height part of the aspect ratio	宽高比中的高度
Guide drawn inside the crop box	裁剪框内显示的辅助线
Width of the corrected image	校正后图像的宽度
Height of the corrected image	校正后图像的高度
Show a grid inside the perspective box	在透视框内显示网格
Size of new artboards	新画板的大小
Artboard width	画板宽度
Artboard height	画板高度
Background of new artboards	新画板的背景
How placed images fit the frame	置入图像适应图框的方式
Count group that new marks are added to	新增标记所属的计数组
Color of the marks of this group	此组标记的颜色
Size of the marks	标记大小
Size of the numbers	数字大小
Name shown on new notes	新注释显示的作者名称
Click selects the topmost layer under the pointer (or hold ⌘)	点击选择指针下的顶层图层（或按住 ⌘）
Click selects the topmost layer under the pointer (or hold Ctrl)	点击选择指针下的顶层图层（或按住 Ctrl）
Snap to guides, layers and the canvas while transforming	变换时吸附到参考线、图层和画布
Keep the proportions while scaling (Shift switches)	缩放时保持比例（Shift 切换）
Rotation of the view in degrees	视图旋转角度（度）
Rotate every open window	旋转所有已打开窗口
Drag left or right to zoom out or in	左右拖动以缩小或放大
Move and transform layers and selections	移动和变换图层及选区
Create, move and resize artboards	创建、移动画板和调整画板大小
Select a rectangle (Shift for a square)	选择矩形区域（Shift 绘制正方形）
Select an ellipse (Shift for a circle)	选择椭圆区域（Shift 绘制圆形）
Select a row one pixel high	选择高度为一个像素的行
Select a column one pixel wide	选择宽度为一个像素的列
Select a freehand area	徒手选择区域
Select an area with straight edges, click by click	逐点点击，以直线边界选择区域
Select an area whose edge snaps to the image	选择边缘吸附到图像轮廓的区域
Select the object inside a rectangle or lasso	选择矩形或套索内的对象
Paint a selection that grows to the edges	涂抹创建自动扩展到边缘的选区
Select areas of similar color	选择相似颜色区域
Crop and straighten the image	裁剪并修齐图像
Crop and correct perspective at the same time	裁剪图像并校正透视
Divide the image into slices for export	将图像划分为切片以便导出
Select, move and edit slices	选择、移动和编辑切片
Draw frames that mask placed images	绘制图框以遮盖置入图像
Pick the foreground color from the image (Alt: background)	从图像取样前景色（Alt：背景色）
Place up to ten color readouts in the Info panel	最多放置十个颜色取样点，在信息面板显示读数
Measure distances and angles; straighten the image	测量距离和角度，修齐图像
Count objects by clicking them	通过点击对对象计数
Attach text notes to the canvas	在画布上添加文字注释
Remove spots by painting over them	涂抹移除污点
Paint with sampled texture matched to the surrounding light (Alt-click a source)	使用取样纹理绘画并匹配周围光照（按住 Alt 点击取样）
Repair a selected area from another area	使用其他区域修复所选区域
Move or extend a selection and fill where it was	移动或扩展选区，并填充原位置
Paint over distractions to remove them	涂抹移除干扰物
Remove red eye from flash photos	移除闪光灯照片中的红眼
Paint with the foreground color	使用前景色绘画
Paint hard-edged strokes	绘制硬边描边
Replace a color while keeping the texture	保留纹理并替换颜色
Paint that mixes with the colors on the canvas	绘画时与画布颜色混合
Paint with pixels sampled from another area (Alt-click a source)	使用其他区域的像素绘画（按住 Alt 点击取样）
Paint with a pattern	使用图案绘画
Paint back pixels from an earlier history state	绘回较早历史状态的像素
Paint stylized strokes from an earlier history state	使用较早历史状态绘制艺术描边
Erase to transparency, or to the background color on a background	擦除为透明；背景图层上擦除为背景色
Erase the sampled color while keeping the edges of the foreground	擦除取样颜色并保留前景边缘
Erase areas of similar color with one click	点击擦除相似颜色区域
Fill with a gradient by dragging	拖动以填充渐变
Fill similar colored areas with the foreground color or a pattern	使用前景色或图案填充相似颜色区域
Soften areas by painting	涂抹柔化区域
Sharpen areas by painting	涂抹锐化区域
Smear paint as if with a finger	像手指一样涂抹颜料
Lighten areas by painting	涂抹提亮区域
Darken areas by painting	涂抹压暗区域
Change the saturation of areas by painting	涂抹调整区域的饱和度
Draw paths and shapes with anchor points and curves	使用锚点和曲线绘制路径及形状
Draw paths freehand	徒手绘制路径
Draw smooth paths by clicking points on the curve	通过点击曲线上的点绘制平滑路径
Add anchor points to a path	向路径添加锚点
Remove anchor points from a path	从路径删除锚点
Switch anchor points between smooth and corner	切换平滑锚点与角点
Add horizontal text	添加横排文字
Add vertical text	添加直排文字
Make a selection in the shape of horizontal text	创建横排文字形状的选区
Make a selection in the shape of vertical text	创建直排文字形状的选区
Select and move whole paths and shapes	选择并移动完整路径和形状
Select and move anchor points and segments	选择并移动锚点和线段
Draw rectangles (Shift for squares)	绘制矩形（Shift 绘制正方形）
Draw ellipses (Shift for circles)	绘制椭圆（Shift 绘制圆形）
Draw triangles	绘制三角形
Draw polygons and stars	绘制多边形和星形
Draw lines and arrows	绘制线条和箭头
Draw shapes from the shape library	从形状库中选择形状绘制
Pan the view (or hold Space with any tool); double-click to fit the image on screen	平移视图（任意工具下按住空格也可）；双击使图像适合屏幕
Rotate the view without changing the image	旋转视图，保持图像内容
Zoom in by clicking or dragging (Alt zooms out); double-click for 100%	点击或拖动放大（Alt 缩小）；双击设为 100%
`.trim();
