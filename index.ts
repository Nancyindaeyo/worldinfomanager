// @ts-nocheck
const CSS_STYLES = `
  /* 控制栏容器 */
  #wiBatchManagerControls {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 12px;
    margin: 5px 0;
    background-color: var(--black50a);
    border: 1px solid var(--SmartThemeBorderColor);
    border-radius: 6px;
    width: 100%;
    box-sizing: border-box;
    z-index: 1000;
    position: relative;
  }

  /* 第一行：主要操作按钮 */
  .wi-batch-row-main {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  /* 第二行：转移面板 */
  .wi-batch-row-transfer {
    display: none; /* 默认隐藏 */
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    padding-top: 8px;
    border-top: 1px dashed var(--SmartThemeBorderColor);
    animation: fadeIn 0.3s;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-5px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* 按钮通用样式 */
  .wi-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    cursor: pointer;
    border: 1px solid var(--SmartThemeBorderColor);
    background-color: var(--SmartThemeBodyBackground);
    color: var(--SmartThemeBodyColor);
    border-radius: 4px;
    font-size: 13px;
    transition: all 0.2s;
  }

  .wi-btn:hover {
    background-color: var(--SmartThemeHoverColor);
  }

  .wi-btn-primary {
    background-color: var(--SmartThemeQuoteColor);
    color: var(--SmartThemeBodyBackground);
    border-color: var(--SmartThemeQuoteColor);
  }
  
  .wi-btn-primary:hover {
    filter: brightness(1.1);
  }

  .wi-btn-danger {
    color: #ff6b6b;
    border-color: #ff6b6b;
  }
  
  .wi-btn-danger:hover {
    background-color: rgba(255, 107, 107, 0.1);
  }

  /* 下拉框 */
  .wi-select {
    padding: 5px;
    border-radius: 4px;
    background-color: var(--SmartThemeBodyBackground);
    color: var(--SmartThemeBodyColor);
    border: 1px solid var(--SmartThemeBorderColor);
    max-width: 200px;
  }

  /* ========== 复选框核心样式 ========== */
  
  /* 复选框容器 */
  .wi-batch-checkbox-wrapper {
    /* 强制使用 Flexbox 布局属性 */
    flex: 0 0 30px !important;
    min-width: 30px !important;
    width: 30px !important;
    align-self: stretch !important;
    
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    
    cursor: pointer;
    background-color: rgba(0, 0, 0, 0.2);
    border-right: 1px solid var(--SmartThemeBorderColor);
    margin-right: 8px !important;
    
    /* 确保顺序在最前 */
    order: -9999 !important;
    z-index: 100;
  }

  .wi-batch-checkbox-wrapper:hover {
    background-color: var(--SmartThemeHoverColor);
  }

  .wi-batch-checkbox {
    width: 18px !important;
    height: 18px !important;
    cursor: pointer;
    margin: 0 !important;
    pointer-events: none;
  }
  
  /* 选中状态高亮 wrapper */
  .wi-batch-checkbox-wrapper.checked {
    background-color: rgba(0, 255, 0, 0.2);
  }
  
  /* 强制 world_entry 使用 flex 布局 */
  /* 这里使用了更具体的选择器以提高优先级 */
  #world_popup_entries_list .world_entry {
    display: flex !important;
    flex-direction: row !important;
    align-items: stretch !important; /* 拉伸以匹配高度 */
    flex-wrap: nowrap !important;
    padding-left: 0 !important;
    position: relative !important;
  }

  /* 确保 world_entry 内部的原有内容能正确填充剩余空间 */
  #world_popup_entries_list .world_entry > *:not(.wi-batch-checkbox-wrapper) {
    flex: 1 1 auto;
  }
`;

// ========================================
// 全局状态
// ========================================

let controlsInjected = false;
let observerAttached = false;
let entriesObserver = null;
let currentTargetWorldbook = null;
let lastKnownSourceBook = null;
const selectedUids = new Set();

/**
 * 注入样式
 */
function injectStyles() {
  if ($('#wiBatchManagerStyles').length === 0) {
    $('<style id="wiBatchManagerStyles">').text(CSS_STYLES).appendTo('head');
    console.log('[世界书批量管理] 样式已注入');
  }
}

/**
 * 移除样式
 */
function removeStyles() {
  $('#wiBatchManagerStyles').remove();
}

// ========================================
// 核心逻辑
// ========================================

/**
 * 获取当前正在编辑的世界书名称
 * 优先匹配文本名称，因为 select value 可能是内部 ID
 */
function getCurrentEditingWorldbook() {
  const $select = $('#world_editor_select');
  if ($select.length > 0) {
    const val = $select.val();
    const text = $select.find('option:selected').text();

    // 尝试获取所有可用世界书名称
    let allNames = [];
    try {
      if (typeof getWorldbookNames === 'function') {
        allNames = getWorldbookNames();
      }
    } catch (e) {}

    // 1. 如果 value 直接匹配某个名字，完美
    if (allNames.includes(val)) return val;

    // 2. 如果 text 直接匹配某个名字，返回 text
    if (allNames.includes(text)) return text;

    // 3. 尝试去除 text 可能包含的计数 (例如 "Name (10 entries)")
    // 简单的假设：名字不包含括号，或者我们尝试前缀匹配
    // 但通常 Tavern 的 dropdown 名字是纯净的。

    // 如果 val 是数字 (ID)，而 text 不是数字，大概率 text 是名字
    if (!isNaN(Number(val)) && isNaN(Number(text))) {
      return text;
    }

    return val ? String(val) : null;
  }
  return null;
}

/**
 * 切换到指定的世界书视图
 * 增强版：支持通过 Name 查找 Value (ID)，兼容 Tavern 不同版本的 select 行为
 */
function switchWorldbookView(worldbookName) {
  const $select = $('#world_editor_select');
  if ($select.length > 0) {
    // 1. 尝试直接匹配 value (如果 value 就是 name)
    $select.val(worldbookName);

    // 2. 如果选中失败（当前值不等于目标值），说明 value 可能是 ID，需要通过 text 查找
    // 注意：$select.val() 返回的是当前选中的 value，如果赋值无效，它不会变
    if ($select.val() !== worldbookName) {
      let foundValue = null;
      $select.find('option').each(function () {
        if ($(this).text() === worldbookName) {
          foundValue = $(this).val();
          return false; // break loop
        }
      });

      if (foundValue !== null) {
        $select.val(foundValue);
      } else {
        console.warn(`[世界书批量管理] 无法在下拉框中找到名为 "${worldbookName}" 的世界书`);
      }
    }

    // 触发 change 事件以通知酒馆更新 UI
    $select.trigger('change');
    console.log(`[世界书批量管理] 切换视图到: ${worldbookName}`);
  }
}

/**
 * 获取所有世界书名称并填充下拉框
 */
async function populateTargetOptions() {
  const $selector = $('#wiBatchTargetSelector');
  if ($selector.length === 0) return;

  const currentVal = $selector.val();
  $selector.empty();

  $selector.append($('<option>').val('').text('-- 选择目标世界书 --'));

  const names = getWorldbookNames();
  // 排除空名字
  const validNames = names.filter(n => n);

  // 获取当前源世界书
  const sourceBook = getCurrentEditingWorldbook();

  validNames.forEach(name => {
    // 标记当前源书籍
    const isSource = name === sourceBook;
    // 如果是源书籍，可以选择禁用，或者加标记
    if (isSource) {
      // $selector.append($('<option>').val(name).text(`${name} (当前)`).prop('disabled', true));
    } else {
      $selector.append($('<option>').val(name).text(name));
    }
  });

  if (currentVal) {
    $selector.val(currentVal);
  } else if (currentTargetWorldbook) {
    $selector.val(currentTargetWorldbook);
  }
}

/**
 * 注入控制栏
 */
function injectControls() {
  if ($('#wiBatchManagerControls').length > 0) return;

  const $wiTopBlock = $('#wiTopBlock');
  if ($wiTopBlock.length === 0) {
    return; // 等待 TopBlock 出现
  }

  // 构建 HTML 结构
  const html = `
    <div id="wiBatchManagerControls">
      <!-- 第一行：主要操作 -->
      <div class="wi-batch-row-main">
         <button id="wiBatchSelectAll" class="wi-btn" title="全选/取消全选">
          <i class="fa-solid fa-check-square"></i> 全选
        </button>
        <button id="wiBatchDelete" class="wi-btn wi-btn-danger" title="删除选中的条目">
          <i class="fa-solid fa-trash"></i> 删除选中
        </button>
        <div style="flex: 1"></div>
        <button id="wiBatchToggleTransfer" class="wi-btn wi-btn-primary" title="打开转移面板">
          <i class="fa-solid fa-right-left"></i> 批量转移...
        </button>
      </div>

      <!-- 第二行：转移面板 (默认隐藏) -->
      <div class="wi-batch-row-transfer" id="wiBatchTransferPanel">
        <label>转移到:</label>
        <select id="wiBatchTargetSelector" class="wi-select" title="选择目标世界书">
          <option value="">加载中...</option>
        </select>
        <button id="wiBatchCopy" class="wi-btn" title="复制条目，保留原条目">
          <i class="fa-solid fa-copy"></i> 仅复制
        </button>
        <button id="wiBatchMove" class="wi-btn" title="复制并删除原条目">
          <i class="fa-solid fa-scissors"></i> 移动(剪切)
        </button>
      </div>
    </div>
  `;

  // 尝试插入位置
  const $rangeBlock = $wiTopBlock.find('.range-block').last();
  if ($rangeBlock.length > 0) {
    $rangeBlock.after(html);
  } else {
    $wiTopBlock.append(html);
  }

  // 绑定事件
  const $controls = $('#wiBatchManagerControls');

  // 1. 切换转移面板
  $controls.on('click', '#wiBatchToggleTransfer', function () {
    const $panel = $('#wiBatchTransferPanel');
    if ($panel.is(':visible')) {
      $panel.slideUp(200);
      $(this).removeClass('active');
    } else {
      $panel.slideDown(200).css('display', 'flex');
      $(this).addClass('active');
      populateTargetOptions(); // 展开时刷新列表
    }
  });

  // 2. 目标选择
  $controls.on('change', '#wiBatchTargetSelector', function () {
    currentTargetWorldbook = $(this).val();
  });

  // 3. 按钮动作
  $controls.on('click', '#wiBatchCopy', () => handleBatchTransfer('copy'));
  $controls.on('click', '#wiBatchMove', () => handleBatchTransfer('move'));
  $controls.on('click', '#wiBatchDelete', handleBatchDelete);
  $controls.on('click', '#wiBatchSelectAll', handleSelectAll);

  // 4. 监听源世界书切换
  $('#world_editor_select')
    .off('change.wiBatch')
    .on('change.wiBatch', function () {
      selectedUids.clear();
      updateUIState();
      lastKnownSourceBook = getCurrentEditingWorldbook(); // 使用封装的函数获取正确名字
      populateTargetOptions();
    });

  populateTargetOptions();

  controlsInjected = true;
  console.log('[世界书批量管理] 控制栏已注入');
}

/**
 * 处理全选/反选
 */
function handleSelectAll() {
  // 仅查找当前可见的 checkbox
  const $checkboxes = $('#world_popup_entries_list .wi-batch-checkbox');
  const total = $checkboxes.length;
  // 检查 wrapper 上的 class 来判断是否选中
  const $wrappers = $('.wi-batch-checkbox-wrapper');
  const checkedCount = $wrappers.filter('.checked').length;

  // 如果当前都选中了，则全不选；否则全选
  const shouldCheck = checkedCount < total;

  if (shouldCheck) {
    $wrappers.addClass('checked');
    $checkboxes.prop('checked', true);
  } else {
    $wrappers.removeClass('checked');
    $checkboxes.prop('checked', false);
  }

  // 更新 Set
  $wrappers.each(function () {
    const $wrapper = $(this);
    // wrapper 是加在 .world_entry 里的，所以 parent 是 entry
    const $entry = $wrapper.parent();
    const uidStr = $entry.attr('uid') || $entry.attr('data-uid');

    if (uidStr) {
      const uid = Number(uidStr);
      if (shouldCheck) {
        selectedUids.add(uid);
      } else {
        selectedUids.delete(uid);
      }
    }
  });

  toastr.info(shouldCheck ? '已全选' : '已取消全选');
}

/**
 * 监听条目列表变化并注入复选框
 */
function startEntryObserver() {
  const targetNode = document.getElementById('world_popup_entries_list');
  if (!targetNode) return;

  console.log('[世界书批量管理] 启动条目列表监听');

  // 立即尝试注入一次
  injectCheckboxes();

  // 监听变化
  entriesObserver = new MutationObserver(mutations => {
    // 检查是否切书
    const currentBook = getCurrentEditingWorldbook();
    if (currentBook !== lastKnownSourceBook) {
      console.log(`[世界书批量管理] 检测到切书: ${lastKnownSourceBook} -> ${currentBook}`);
      selectedUids.clear();
      lastKnownSourceBook = currentBook;
      populateTargetOptions();
    }

    let shouldUpdate = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        shouldUpdate = true;
        break;
      }
    }

    if (shouldUpdate) {
      injectCheckboxes();
    }
  });

  entriesObserver.observe(targetNode, { childList: true, subtree: false });
}

/**
 * 向条目注入复选框
 */
// @ts-nocheck
function injectCheckboxes() {
  const $list = $('#world_popup_entries_list');

  // 直接获取所有子元素作为条目，不再依赖特定 class
  // 仅在元素是 world_entry 时才注入，避免注入到错误的地方
  const $entries = $list.children('.world_entry').filter(function () {
    // 排除非元素节点和已经是 checkbox 的节点
    return this.nodeType === 1 && $(this).find('.wi-batch-checkbox-wrapper').length === 0;
  });

  if ($entries.length > 0) {
    // console.log(`[世界书批量管理] 发现 ${$entries.length} 个新条目`);

    $entries.each(function () {
      const $entry = $(this);

      // 尝试多种方式获取 UID
      const uidStr = $entry.attr('uid') || $entry.attr('data-uid') || $entry.data('uid');
      let uid = null;

      if (uidStr) {
        uid = Number(uidStr);
      } else {
        const $uidInput = $entry.find('input[name="uid"]');
        if ($uidInput.length > 0) {
          uid = Number($uidInput.val());
        }
      }

      // 如果找不到 UID，也要注入 checkbox（为了视觉统一），但禁用或标记
      // 不过为了核心功能，这里还是跳过吧，除非
      if (uid === null || isNaN(uid)) {
        return;
      }

      const $checkboxWrapper = $(`
          <div class="wi-batch-checkbox-wrapper" title="UID: ${uid}">
            <input type="checkbox" class="wi-batch-checkbox" />
          </div>
        `);

      // 恢复选中状态
      if (selectedUids.has(uid)) {
        $checkboxWrapper.addClass('checked');
        $checkboxWrapper.find('input').prop('checked', true);
      }

      // 绑定点击事件到 wrapper
      $checkboxWrapper.on('click', function (e) {
        e.stopPropagation(); // 阻止冒泡
        e.preventDefault(); // 阻止默认行为

        const $this = $(this);
        const $cb = $this.find('input');

        // 切换状态
        const isNowChecked = !$this.hasClass('checked');

        if (isNowChecked) {
          $this.addClass('checked');
          $cb.prop('checked', true);
          selectedUids.add(uid);
        } else {
          $this.removeClass('checked');
          $cb.prop('checked', false);
          selectedUids.delete(uid);
        }

        updateUIState();
      });

      // 插入到最前面
      $entry.prepend($checkboxWrapper);
    });
  }
}

/**
 * 更新UI状态 (按钮禁用等)
 */
function updateUIState() {
  const count = selectedUids.size;
  const $mainRow = $('.wi-batch-row-main');
  const $transferRow = $('.wi-batch-row-transfer');

  if (count > 0) {
    $('#wiBatchDelete').text(`删除选中 (${count})`).prop('disabled', false);
    $('#wiShowTransfer').text(`批量转移... (${count})`).prop('disabled', false);
  } else {
    $('#wiBatchDelete').text('删除选中').prop('disabled', true);
    $('#wiShowTransfer').text('批量转移...').prop('disabled', true);
    // 如果没有选中，且转移面板开着，可以考虑关掉，或者保持
  }
}

/**
 * 处理批量转移 (复制或移动)
 */
async function handleBatchTransfer(mode = 'copy') {
  const targetBook = currentTargetWorldbook;
  if (!targetBook) {
    toastr.warning('请选择目标世界书');
    return;
  }

  if (selectedUids.size === 0) {
    toastr.warning('请先勾选要操作的条目');
    return;
  }

  const sourceBook = getCurrentEditingWorldbook();
  if (!sourceBook) {
    toastr.error('无法确定当前源世界书名称');
    return;
  }

  if (sourceBook === targetBook) {
    toastr.warning('源世界书和目标世界书相同');
    return;
  }

  // 验证源世界书名称
  const allBooks = getWorldbookNames();
  let validSourceBook = sourceBook;
  if (!allBooks.includes(sourceBook)) {
    console.warn(`[批量转移] 警告：源世界书名 "${sourceBook}" 未在可用列表里找到。`);
    const match = allBooks.find(b => b == sourceBook);
    if (match) {
      validSourceBook = match;
    } else {
      toastr.error(`找不到名为 "${sourceBook}" 的世界书。`);
      return;
    }
  }

  const modeText = mode === 'move' ? '移动' : '复制';

  if (!confirm(`确定要将选中的 ${selectedUids.size} 个条目 **${modeText}** 到 "${targetBook}" 吗？`)) {
    return;
  }

  try {
    const entries = await getWorldbook(validSourceBook);
    const entriesToProcess = entries.filter(e => selectedUids.has(e.uid));

    if (entriesToProcess.length === 0) {
      toastr.warning('未找到对应的条目数据');
      return;
    }

    // 1. 在目标书创建新条目
    const newEntries = entriesToProcess.map(e => {
      const { uid, ...rest } = e; // 移除 UID，让其自动生成
      return rest;
    });

    await createWorldbookEntries(targetBook, newEntries);

    // 2. 如果是移动，则删除源条目
    if (mode === 'move') {
      await deleteWorldbookEntries(validSourceBook, entry => selectedUids.has(entry.uid));
      toastr.success(`已成功移动 ${newEntries.length} 个条目到 "${targetBook}"`);
    } else {
      toastr.success(`已成功复制 ${newEntries.length} 个条目到 "${targetBook}"`);
    }

    // 3. 自动跳转到目标世界书
    // 延时一点点确保数据写入完成
    setTimeout(() => {
      switchWorldbookView(targetBook);
      selectedUids.clear();
      updateUIState();

      // 自动关闭转移面板
      $('#wiBatchTransferPanel').slideUp();
      $('#wiBatchToggleTransfer').removeClass('active');
    }, 100);
  } catch (err) {
    console.error(err);
    toastr.error(`${modeText}失败: ` + String(err));
  }
}

/**
 * 处理批量删除
 */
async function handleBatchDelete() {
  if (selectedUids.size === 0) {
    toastr.warning('请先勾选要删除的条目');
    return;
  }

  const sourceBook = getCurrentEditingWorldbook();
  if (!sourceBook) {
    toastr.error('无法确定当前源世界书名称');
    return;
  }

  // 验证源世界书名称是否存在
  const allBooks = getWorldbookNames();
  // 宽松匹配：如果找不到精确匹配，尝试查找是否存在包含关系的（可能是UI显示的值与内部名不一致）
  let targetBookName = sourceBook;
  if (!allBooks.includes(sourceBook)) {
    console.warn(`[批量删除] 警告：源世界书名 "${sourceBook}" 未在可用列表里找到:`, allBooks);
    // 尝试修复：有时候 select 的 value 可能是 index 或者其他的，虽然通常是 name
    // 如果 allBooks 里有且仅有一个匹配 sourceBook (作为字符串) 的，就用那个
    const match = allBooks.find(b => b == sourceBook);
    if (match) {
      targetBookName = match;
      console.log(`[批量删除] 自动修正世界书名为: "${targetBookName}"`);
    } else {
      // 如果还是找不到，可能是数据未同步，提示用户
      toastr.error(`找不到名为 "${sourceBook}" 的世界书，请尝试刷新页面。`);
      return;
    }
  }

  if (!confirm(`确定要从 "${targetBookName}" 中删除选中的 ${selectedUids.size} 个条目吗？\n此操作不可撤销！`)) {
    return;
  }

  try {
    // 再次验证世界书是否可读取
    try {
      await getWorldbook(targetBookName);
    } catch (e) {
      throw new Error(`无法读取世界书 "${targetBookName}": ${e.message}`);
    }

    const { deleted_entries } = await deleteWorldbookEntries(targetBookName, entry => selectedUids.has(entry.uid));

    toastr.success(`已删除 ${deleted_entries.length} 个条目`);
    selectedUids.clear();
    updateUIState(); // 更新UI状态
  } catch (err) {
    console.error(err);
    toastr.error('删除失败: ' + String(err));
  }
}

// ========================================
// 生命周期管理
// ========================================

let popupCheckInterval = null;

function init() {
  injectStyles();

  if (typeof toastr !== 'undefined') {
    toastr.info('世界书批量管理脚本已加载');
  }

  // 定时检查世界书弹窗是否存在
  popupCheckInterval = window.setInterval(() => {
    const $popup = $('#world_popup');
    const isVisible = $popup.length > 0 && $popup.is(':visible');

    if (isVisible) {
      // 1. 注入控制栏
      if (!controlsInjected) {
        injectControls();
        if (controlsInjected) {
          lastKnownSourceBook = getCurrentEditingWorldbook();
          // 首次打开也要尝试注入复选框
          injectCheckboxes();
        }
      }

      // 2. 启动监听 (仅当DOM存在时)
      const targetNode = document.getElementById('world_popup_entries_list');

      if (!observerAttached && targetNode) {
        startEntryObserver();
        observerAttached = true;
      } else if (observerAttached && !targetNode) {
        // 目标节点丢失，重置 observer
        if (entriesObserver) {
          entriesObserver.disconnect();
          entriesObserver = null;
        }
        observerAttached = false;
      }

      // 3. 保底检查：始终尝试注入复选框，防止被重绘覆盖
      // 即使 observer 还没挂载好，只要列表存在就尝试注入
      if (controlsInjected && $('#world_popup_entries_list').length > 0) {
        injectCheckboxes();
      }
    } else {
      // 弹窗关闭，清理
      if (controlsInjected || observerAttached) {
        if (entriesObserver) {
          entriesObserver.disconnect();
          entriesObserver = null;
        }
        observerAttached = false;

        $('#wiBatchManagerControls').remove();
        controlsInjected = false;

        selectedUids.clear();
        console.log('[世界书批量管理] 弹窗关闭，清理资源');
      }
    }
  }, 500);
}

function cleanup() {
  if (popupCheckInterval) {
    clearInterval(popupCheckInterval);
    popupCheckInterval = null;
  }
  if (entriesObserver) {
    entriesObserver.disconnect();
    entriesObserver = null;
  }
  removeStyles();
  $('#wiBatchManagerControls').remove();
  $('.wi-batch-checkbox-wrapper').remove();
}

// 脚本入口
const jq = typeof jQuery !== 'undefined' ? jQuery : typeof $ !== 'undefined' ? $ : null;

if (jq) {
  jq(() => {
    console.log('[世界书批量管理] 脚本加载');
    init();
  });
} else {
  console.error('[世界书批量管理] jQuery 未加载，脚本无法运行');
}

// 脚本卸载
$(window).on('pagehide', () => {
  cleanup();
});
