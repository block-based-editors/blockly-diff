


/**
 * @license
 * Copyright 2012 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Loading and saving blocks with localStorage and cloud storage.
 * @author q.neutron@gmail.com (Quynh Neutron)
 */
'use strict';

// Create a namespace.
var BlocklyStorage = {};



BlocklyStorage.HTTPREQUEST_ERROR = 'There was a problem with the request.\n';
BlocklyStorage.LINK_ALERT = 'Share your blocks with this link:\n\n%1';
BlocklyStorage.HASH_ERROR = 'Sorry, "%1" doesn\'t correspond with any saved Blockly file.';
BlocklyStorage.XML_ERROR = 'Could not load your saved file.\n' +
		'Perhaps it was created with a different version of Blockly?';

/**
 * Backup code blocks to localStorage.
 * @param {!Blockly.WorkspaceSvg} workspace Workspace.
 * @private
 */
BlocklyStorage.backupBlocks_ = function(workspace, id) {
  if ('localStorage' in window) {
    var xml = Blockly.Xml.workspaceToDom(workspace);
    // Gets the current URL, not including the hash.
    var url = window.location.href.split('#')[0]+id;
    window.localStorage.setItem(url, Blockly.Xml.domToText(xml));
  }
};

/**
 * Bind the localStorage backup function to the unload event.
 * @param {Blockly.WorkspaceSvg=} opt_workspace Workspace.
 */
BlocklyStorage.backupOnUnload = function(opt_workspace,id) {
  var workspace = opt_workspace || Blockly.getMainWorkspace();
  window.addEventListener('unload',
      function() {BlocklyStorage.backupBlocks_(workspace,id);}, false);
};

/**
 * Restore code blocks from localStorage.
 * @param {Blockly.WorkspaceSvg=} opt_workspace Workspace.
 */
BlocklyStorage.restoreBlocks = function(opt_workspace, id) {
  var url = window.location.href.split('#')[0];
  if ('localStorage' in window && window.localStorage[url+id]) {
    var workspace = opt_workspace || Blockly.getMainWorkspace();
    var xml = Blockly.Xml.textToDom(window.localStorage[url+id]);
    Blockly.Xml.domToWorkspace(xml, workspace);
   }
};

/**
 * Save blocks to database and return a link containing key to XML.
 * @param {Blockly.WorkspaceSvg=} opt_workspace Workspace.
 */
BlocklyStorage.link = function(opt_workspace, editor) {
  var workspace = opt_workspace || Blockly.getMainWorkspace();
  var xml = Blockly.Xml.workspaceToDom(workspace, true);
  // Remove x/y coordinates from XML if there's only one block stack.
  // There's no reason to store this, removing it helps with anonymity.
  if (workspace.getTopBlocks(false).length == 1 && xml.querySelector) {
    var block = xml.querySelector('block');
    if (block) {
      block.removeAttribute('x');
      block.removeAttribute('y');
    }
  }
  var data = Blockly.Xml.domToText(xml);
  BlocklyStorage.makeRequest_('/storage', 'xml', data, workspace, editor);
};

/**
 * Retrieve XML text from database using given key.
 * @param {string} key Key to XML, obtained from href.
 * @param {Blockly.WorkspaceSvg=} opt_workspace Workspace.
 */
BlocklyStorage.retrieveXml = function(key, opt_workspace, editor) {
  var workspace = opt_workspace || Blockly.getMainWorkspace();
  BlocklyStorage.makeRequest_('/storage', 'key', key, workspace, editor);
};

/**
 * Global reference to current AJAX request.
 * @type {XMLHttpRequest}
 * @private
 */
BlocklyStorage.httpRequest_ = null;

/**
 * Fire a new AJAX request.
 * @param {string} url URL to fetch.
 * @param {string} name Name of parameter.
 * @param {string} content Content of parameter.
 * @param {!Blockly.WorkspaceSvg} workspace Workspace.
 * @private
 */
BlocklyStorage.makeRequest_ = function(url, name, content, workspace, editor) {
  if (BlocklyStorage.httpRequest_) {
    // AJAX call is in-flight.
    BlocklyStorage.httpRequest_.abort();
  }
  BlocklyStorage.httpRequest_ = new XMLHttpRequest();
  BlocklyStorage.httpRequest_.name = name;
  BlocklyStorage.httpRequest_.onreadystatechange =
      BlocklyStorage.handleRequest_;
  BlocklyStorage.httpRequest_.open('POST', url);
  BlocklyStorage.httpRequest_.setRequestHeader('Content-Type',
      'application/x-www-form-urlencoded');
  BlocklyStorage.httpRequest_.send(name + '=' + encodeURIComponent(content)+ '&workspace=' + encodeURIComponent(workspace.name));
  BlocklyStorage.httpRequest_.workspace = workspace;
};

/**
 * Callback function for AJAX call.
 * @private
 */
BlocklyStorage.handleRequest_ = function() {
  if (BlocklyStorage.httpRequest_.readyState == 4) {
    if (BlocklyStorage.httpRequest_.status != 200) {
      BlocklyStorage.alert(BlocklyStorage.HTTPREQUEST_ERROR + '\n' +
          'httpRequest_.status: ' + BlocklyStorage.httpRequest_.status);
    } else {
      var data = BlocklyStorage.httpRequest_.responseText.trim();
      if (BlocklyStorage.httpRequest_.name == 'xml') {
        window.location.hash = data;
        BlocklyStorage.alert(BlocklyStorage.LINK_ALERT.replace('%1',
            window.location.href));
      } else if (BlocklyStorage.httpRequest_.name == 'key') {
        if (!data.length) {
          BlocklyStorage.alert(BlocklyStorage.HASH_ERROR.replace('%1',
              window.location.hash));
        } else {
          BlocklyStorage.loadXml_(data, BlocklyStorage.httpRequest_.workspace);
        }
      }
      BlocklyStorage.monitorChanges_(BlocklyStorage.httpRequest_.workspace);
    }
    BlocklyStorage.httpRequest_ = null;
  }
};

/**
 * Start monitoring the workspace.  If a change is made that changes the XML,
 * clear the key from the URL.  Stop monitoring the workspace once such a
 * change is detected.
 * @param {!Blockly.WorkspaceSvg} workspace Workspace.
 * @private
 */
BlocklyStorage.monitorChanges_ = function(workspace) {
  var startXmlDom = Blockly.Xml.workspaceToDom(workspace);
  var startXmlText = Blockly.Xml.domToText(startXmlDom);
  function change() {
    var xmlDom = Blockly.Xml.workspaceToDom(workspace);
    var xmlText = Blockly.Xml.domToText(xmlDom);
    if (startXmlText != xmlText) {
      window.location.hash = '';
      workspace.removeChangeListener(change);
    }
  }
  workspace.addChangeListener(change);
};

/**
 * Load blocks from XML.
 * @param {string} xml Text representation of XML.
 * @param {!Blockly.WorkspaceSvg} workspace Workspace.
 * @private
 */
BlocklyStorage.loadXml_ = function(xml, workspace) {
  try {
    xml = Blockly.Xml.textToDom(xml);
  } catch (e) {
    BlocklyStorage.alert(BlocklyStorage.XML_ERROR + '\nXML: ' + xml);
    return;
  }
  // Clear the workspace to avoid merge.
  workspace.clear();
  Blockly.Xml.domToWorkspace(xml, workspace);
};

/**
 * Present a text message to the user.
 * Designed to be overridden if an app has custom dialogs, or a butter bar.
 * @param {string} message Text to alert.
 */
BlocklyStorage.alert = function(message) {
  window.alert(message);
};

var toolbox = {
 "kind": "categoryToolbox",
 "contents": [
  {
   "kind": "category",
   "name" : "Basic",
   "colour": "#090",
   "contents": [
    {
      "kind": "block",
      "type": "generate_code"
    },
    {
      "kind": "block",
      "type": "generate_token"
    },
    {
      "kind": "block",
      "type": "generate_field_value2"
    },
    {
      "kind": "block",
      "type": "generate_field_text"
    },
    {
      "kind": "block",
      "type": "generate_statements2"
    },
    {
      "kind": "block",
      "type": "generate_values2"
    },
    {
      "kind": "block",
      "type": "generate_comment"
    },
    {
      "kind": "block",
      "type": "generate_javascript"
    },
   ]
  },
  {
   "kind": "category",
   "name" : "Extra",
   "colour": "#399",
   "contents": [
    {
      "kind": "block",
      "type": "generate_block_type"
    },
    {
      "kind": "block",
      "type": "generate_token_if_next_block"
    },
    {
      "kind": "block",
      "type": "generate_list_length"
    },
    {
      "kind": "block",
      "type": "generate_list_index"
    },
   ]
  },

 ]
}
    



// hardcoded till the end

var options = { 
	toolbox : toolbox, 
	collapse : true, 
	comments : true, 
	disable : false, 
	maxBlocks : Infinity, 
	trashcan : false, 
	horizontalLayout : false, 
	toolboxPosition : 'start', 
	css : true, 
  zoom: {
    controls: true,
  },
	media : 'https://blockly-demo.appspot.com/static/media/', 
	rtl : false, 
	scrollbars : true, 
	sounds : true, 
	oneBasedIndex : true
};
function highLight(event)
{
  
  var blocks = Blockly.getMainWorkspace().getAllBlocks()
  for (var i=0; i<blocks.length; i++)
  {
	  var block = blocks[i];
    //highlightCurrentSelection_(blocks[i])
    var connections = block.getConnections_();

    for (var j=0;j<connections.length;j++)
    {
      var connection = connections[j]
      if (connection.type == Blockly.connectionTypes.NEXT_STATEMENT)
      {
        connection.highlight();
      }
    }
  }
}

function unhighlightCommon(currentBlock)
{
  const path = currentBlock.pathObject.svgPath;
  Blockly.utils.dom.removeClass(path, 'blockly-ws-merge-highlight-mine-added');
  Blockly.utils.dom.removeClass(path, 'blockly-ws-merge-highlight-mine-removed');

}
function highlightMineAdded(currentBlock) {
  const path = currentBlock.pathObject.svgPath;
  Blockly.utils.dom.addClass(path, 'blockly-ws-merge-highlight-mine-added');
}

function highlightMineRemoved(currentBlock) {
  const path = currentBlock.pathObject.svgPath;
  Blockly.utils.dom.addClass(path, 'blockly-ws-merge-highlight-mine-removed');
}

function highlightValueChanged(currentBlock) {
  const path = currentBlock.pathObject.svgPath;
  Blockly.utils.dom.addClass(path, 'blockly-ws-merge-highlight-value-changed');
}

function codeGeneration(event) {
  if (Blockly.Code)
  {  
      try {
          var code = Blockly.Code.workspaceToCode(mine_workspace);
	  } catch (e) {
		console.warn("Error while creating code", e);
		code = "Error while creating code:" + e
	  }     
      document.getElementById('codeDiv').value = code;
  }
}

function updateDropdownRename(event)
{
	if (event.type == "change" && (event.name=="NAME" || event.name=="FIELDNAME" ) || event.type == "create")
	{
    var blocks = mine_workspace.getAllBlocks(); 
    for (var k = 0; k < blocks.length; k++) {
      var block = blocks[k];
 
      for (var i = 0, input; (input = block.inputList[i]); i++) {
        for (var j = 0, field; (field = input.fieldRow[j]); j++) {
          if (field.getOptions) // is dropdown
          {
           // during name update of a block  
           // stay to have the same value (block id)
           // but need to rerender the text
           // get and setValue are needed (probably some side effect)
           var value = field.getValue();
           var field_options = field.getOptions();
           field.setValue(value)     
           field.forceRerender()
          }
        }
      }
   }
  }
}

var mine_workspace;
var previous_workspace;

function vscode_start()
{
  inject();
  register_workspace_serialization()

  search();

}

function search()
{
  mine_workspace.workspaceSearch = new WorkspaceSearch(mine_workspace);

  mine_workspace.workspaceSearch.init();
  //workspace.workspaceSearch.open();

  previous_workspace.workspaceSearch = new WorkspaceSearch(previous_workspace);

	previous_workspace.workspaceSearch.init();
	//previous_workspace.workspaceSearch.open();
	
}

function inject()
{
  /* Inject your workspace */ 
  mine_workspace = Blockly.inject("blocklyMineDiv", options);
  mine_workspace.name="Concrete"
  previous_workspace = Blockly.inject("blocklyPreviousDiv", options);
  previous_workspace.name="Previous"
  
}

function start()
{
  inject();

//  BlocklyStorage.restoreBlocks(workspace, 'concrete');
//  BlocklyStorage.backupOnUnload(workspace, 'concrete');

//  BlocklyStorage.restoreBlocks(previous_workspace, 'concrete');
//  BlocklyStorage.backupOnUnload(previous_workspace, 'concrete');


  //workspace.addChangeListener(codeGeneration);
  mine_workspace.addChangeListener(updateDropdownRename);
  mine_workspace.addChangeListener(myMineSelection);
  
  previous_workspace.addChangeListener(myPreviousSelection);

  mine_workspace.addChangeListener(show_diffs);
  previous_workspace.addChangeListener(show_diffs);
  mine_workspace.addChangeListener(scroll);
  previous_workspace.addChangeListener(scroll);
  
  register_workspace_serialization()
  search();
  add_load_previous();
  add_load_mine();
  injectMergeCss();
  load_previous_from_website()
  load_mine_from_website()
}

function intersection(setA, setB) {
  const _intersection = new Set();
  for (const elem of setB) {
    if (setA.has(elem)) {
      _intersection.add(elem);
    }
  }
  return _intersection;
}

function difference(setA, setB) {
  const _difference = new Set(setA);
  for (const elem of setB) {
    _difference.delete(elem);
  }
  return _difference;
}

function get_ids(blocks)
{
	var ids = new Set();
  for(var i=0; i<blocks.length;i++)
  {
    var block=blocks[i];
    ids.add(block.id);
  }
	
  return ids

}

function get_connections(blocks)
{
  var connections_set = new Set();

  for (var i=0; i<blocks.length; i++)
  {
	  var block = blocks[i];
    var connections = block.getConnections_();

    for (var j=0;j<connections.length;j++)
    {
      var connection = connections[j]
      if (connection.type == Blockly.connectionTypes.NEXT_STATEMENT)
      {
		    var input = connection.getParentInput()
		    var name
		    if (input)
		    {
			    name = input.name  
		    }
		    else
        { 
          name = 'next'
        }
		    var target_id
		    var target = connection.targetBlock()
		    if (target)
		    {
			    target_id = target.id
		    }
		    else
        { 
          target_id = 'none'
        }
			  connections_set.add(block.id+' '+name+' '+target_id)
      }
    }
  }
  return connections_set;
}

var busy = false

function scroll(event)
{

	if(event.type =='viewport_change')
	{
    if (busy)
    {
      // scroll bar triggered by other scrollbar
      // now that we had the second trigger we not busy anymore
      busy = false
      return
    }

    busy = true
    
    if (event.workspaceId == mine_workspace.id)
    {
      var other_workspace = previous_workspace
      var this_workspace = mine_workspace
    }
    else
    {
      var other_workspace = mine_workspace
      var this_workspace = previous_workspace
    }
    var metrics = other_workspace.getMetrics()
    var all_blocks = this_workspace.getAllBlocks()
    var top_left_block_id
    for (var i = 0;i<all_blocks.length;i++)
    {
      var block = all_blocks[i]
      var top_left_block_xy = block.getRelativeToSurfaceXY()
      // find most to left top block
      if (top_left_block_xy.y > -this_workspace.scrollY)
      {
        top_left_block_id = block.id;
        break
      }
    }
  
		var corresponding_block = other_workspace.getBlockById(top_left_block_id)
    if (corresponding_block)
    {
      var left_xy = corresponding_block.getRelativeToSurfaceXY()
      other_workspace.scrollbar.set(left_xy.x * other_workspace.scale - metrics.scrollLeft,
                                    left_xy.y * other_workspace.scale - metrics.scrollTop - 
                                    // scroll the same amount as the top_left_block to align horizontal  
                                     top_left_block_xy.y - this_workspace.scrollY)  
    }
  }
 
}

function saveFields(block) {
  const fields = Object.create(null);
  for (let i = 0; i < block.inputList.length; i++) {
    const input = block.inputList[i];
    for (let j = 0; j < input.fieldRow.length; j++) {
      const field = input.fieldRow[j];
      if (field.isSerializable()) {
        fields[field.name] = field.saveState(true);
      }
    }
  }
  return fields
};

function myMineSelection(event) {
	
  if (event.type == 'click' && !event.blockId)
  {
    previous_workspace.workspaceSearch.unhighlightSearchGroup_(previous_workspace.getAllBlocks());
  }
  
  if (event.type == "selected" )
	{
		if(event.newElementId) {
			// get the block from the other workspace
      var block = previous_workspace.getBlockById(event.newElementId);
      previous_workspace.workspaceSearch.unhighlightSearchGroup_(block.workspace.getAllBlocks());
      previous_workspace.workspaceSearch.highlightSearchGroup_([block]);
    	// highlight only works if the search group is applied first
      previous_workspace.workspaceSearch.highlightCurrentSelection_(block);
      previous_workspace.workspaceSearch.scrollToVisible_(block);
		}
	}
}

function myPreviousSelection(event) {
	if (event.type == "selected" )
	{
		if(event.newElementId) {
      var block = mine_workspace.getBlockById(event.newElementId);
      mine_workspace.workspaceSearch.unhighlightSearchGroup_(block.workspace.getAllBlocks());
      mine_workspace.workspaceSearch.highlightSearchGroup_([block]);
    	// highlight only works if the search group is applied first
      mine_workspace.workspaceSearch.highlightCurrentSelection_(block);
      mine_workspace.workspaceSearch.scrollToVisible_(block);
		}
	}
}



function show_diffs(event)
{

  var mine_blocks = mine_workspace.getAllBlocks()
  var previous_blocks = previous_workspace.getAllBlocks()

  var mine_ids = get_ids(mine_blocks);
  var previous_ids = get_ids(previous_blocks);

  var ids_added_mine = difference(mine_ids, previous_ids)
  var ids_removed_mine = difference(previous_ids, mine_ids)
  var ids_common = intersection(mine_ids, previous_ids)
  
  for (const id of ids_added_mine) {
    var mine_block = mine_workspace.getBlockById(id);
    highlightMineAdded(mine_block)
  }
  
  for (const id of ids_removed_mine) {
    var previous_block = previous_workspace.getBlockById(id);
    highlightMineRemoved(previous_block)
  }

  // also unhighlight the other
  for (const id of ids_common) {
    var previous_block = previous_workspace.getBlockById(id);
    var mine_block = mine_workspace.getBlockById(id)
    unhighlightCommon(previous_block)
    unhighlightCommon(mine_block) 
  }


  var mine_connections = get_connections(mine_blocks);
  var previous_connections = get_connections(previous_blocks);

  var connections_added_mine = difference(mine_connections, previous_connections)
  var connections_remove_mine = difference(previous_connections, mine_connections)

  var connections_common = intersection(previous_connections, mine_connections)

  highlight_connections(connections_added_mine, mine_workspace)
  highlight_connections(connections_remove_mine, previous_workspace)

  unhighlight_connections(connections_common, mine_workspace)
  unhighlight_connections(connections_common, previous_workspace)
  
  for (const id of ids_common) {
    var previous_block = previous_workspace.getBlockById(id);
    var mine_block = mine_workspace.getBlockById(id)
    
    
    var mine_state = saveFields(mine_block);
    var previous_state = saveFields(previous_block);
    

    for (const [key, value] of Object.entries(mine_state)) {
      if (previous_state[key]===value)
      {
        apply_valid(mine_block, key)
        apply_valid(previous_block, key)
      }
      else
      {
        apply_invalid(mine_block, key)
        apply_invalid(previous_block, key)
      }
    }
  }
}

function apply_valid(block, key)
{
  var field = block.getField(key)
  var root = field.getSvgRoot()
  
  Blockly.utils.dom.removeClass(root.children[0], 'blocklyInvalidInput');

}

function apply_invalid(block, key)
{
  var field = block.getField(key)
  var root = field.getSvgRoot()
  
  Blockly.utils.dom.addClass(root.children[0], 'blocklyInvalidInput');

}


function unhighlight_connections(connections_same, this_workspace)
{  
  for (const id of connections_same) {
    var sp  = id.split(' ')
    var from_id = sp[0]
    var input_name = sp[1]
    var target_id = sp[2]
    var block = this_workspace.getBlockById(from_id);
  
    var connections = block.getConnections_();

    for (var j=0;j<connections.length;j++)
    {
      var connection = connections[j]
      if (connection.type == Blockly.connectionTypes.NEXT_STATEMENT)
      {
		    var input = connection.getParentInput()
		    if (input)
		    {
			    if (input.name == input_name)
          {
            if (connection.highlightPath)
            {
              connection.unhighlight()
            }
          }  
		    }
		    else
        { 
          if (input_name == 'next')
          {
            if (connection.highlightPath)
            {
              connection.unhighlight()
            }
          }
        }
      }
    }
  } 
}


function highlight_connections(connections_diff, this_workspace)
{  
  
  for (const id of connections_diff) {
    var sp  = id.split(' ');
    var from_id = sp[0];
    var input_name = sp[1];
    var target_id = sp[2];
    var block = this_workspace.getBlockById(from_id);
  
    var connections = block.getConnections_();

    for (var j=0;j<connections.length;j++)
    {
      var connection = connections[j]
      if (connection.type == Blockly.connectionTypes.NEXT_STATEMENT)
      {
		    var input = connection.getParentInput()
		    if (input)
		    {
			    if (input.name == input_name)
          {
            if (!connection.highlightPath)
            { 
              connection.highlight()
            }
          }  
		    }
		    else
        { 
          if (input_name == 'next')
          {
            if (!connection.highlightPath)
            {
              connection.highlight()
            }
          }
        }
      }
    }
  } 
}

function loadFn(editor)
{
  
}

function clearFn(workspace)
{
}

function saveFn(workspace)
{
}
const serialization_name='editor';

function register_workspace_serialization()
{
  Blockly.serialization.registry.register(
    serialization_name,  // Name
    {
      save: saveFn,      // Save function
      load: loadFn,      // Load function
      clear: clearFn,    // Clear function
      priority: 1,      // Priority
    }
    );
}


function get_json(workspace)
{
  var json_text = Blockly.serialization.workspaces.save(workspace);
  var data = JSON.stringify(json_text, undefined, 2);
  return data
}

function download(name, url) {
  const a = document.createElement('a')
  a.href = url
  
  a.download = name;
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

function saveFile()
{
    var data = get_json(mine_workspace)
    var blob = new Blob([data], {type: 'text/plain;charset=utf-8'});
    var url = URL.createObjectURL(blob);
    download('concrete.json', url)
};


function replace_blocks(obj)
{
	var properties = Object.getOwnPropertyNames(obj)
	for (var j=0; j<properties.length;j++)
	{
        if (properties[j]=='block')
        {
			// remove the block but keep the id
			var id = obj.block.id
			delete obj.block
			obj.block = { "id":id }
        } else if (typeof(obj[properties[j]])=='object')
        {
        	replace_blocks(obj[properties[j]])
        }
	}
}

function inject_blocks(obj, saved_blocks)
{
    var properties = Object.getOwnPropertyNames(obj)
    for (var j=0; j<properties.length;j++)
	  {
        if (properties[j]=='block')
        {
	        obj.block = saved_blocks[obj.block.id]
        }
        // kind of strange that the type can be object and the value null 
        else if (typeof(obj[properties[j]])=='object' && obj[properties[j]]!=null)
        {
          inject_blocks(obj[properties[j]], saved_blocks)
        }
        else
        {
          // value, no need to process
        }
	  }
}

function save_mergeable(workspace)
{
    var blocks = workspace.getAllBlocks();
    var save_blocks = {};
    for (var i=0; i<blocks.length;i++)
    {
    	var json_obj = Blockly.serialization.blocks.save(blocks[i], {addCoordinates: true, 
    	                                                             addInputBlocks: true, 
    	                                                             addNextBlocks: true, 
    	                                                             doFullSerialization: true})

        replace_blocks(json_obj)
        save_blocks[blocks[i].id] = json_obj

    }
    save_blocks['top_blocks'] = workspace.getTopBlocks().map(block => block.id);
    save_blocks['mergeable'] = true;

    return save_blocks
}

function load_blocks(editor)
{
}
function load_mergeable(saved_blocks, workspace)
{

  fetch('editors/'+saved_blocks.editor.name+'/blocks.js')
	.then(req => req.text())
	.then((res) => {
      // load the blocks
	    // Blockly is already loaded so remove from blocks.js
      res = res.replace("import * as Blockly from 'blockly';","")
      eval(res);
      var keys = Object.keys(saved_blocks)
      for (var i=0; i<keys.length;i++)
      {
            inject_blocks(saved_blocks[keys[i]],saved_blocks)
      }
      workspace.clear()
      for (var i=0; i<saved_blocks['top_blocks'].length;i++)
      {
        var id = saved_blocks['top_blocks'][i]
        Blockly.serialization.blocks.append(saved_blocks[id], workspace)
      }
  })
	
	
	
}

function load_json_text_to_workspace(workspace, text)
{
  var json = JSON.parse(text);
  workspace.clear()
  if (json.mergeable)
  {
    load_mergeable(json, workspace)
  }
  else
  {
	if(json.editor.name)
	{
    
		 fetch('editors/'+json.editor.name+'/blocks.js')
	    .then(req => req.text())
	    .then((res) => {
        // load the blocks
	      // Blockly is already loaded so remove from blocks.js
        res = res.replace("import * as Blockly from 'blockly';","")
        eval(res);

        Blockly.serialization.workspaces.load(json, workspace)
 
	
	    })
	}
  }
}

function load_previous_from_website()
{
 fetch('codegen_previous.json')
	.then(req => req.text())
	.then((res) => {
      load_json_text_to_workspace(previous_workspace, res);
  })
}


function load_mine_from_website()
{
 fetch('codegen_mine.json')
	.then(req => req.text())
	.then((res) => {
      load_json_text_to_workspace(mine_workspace, res);
  })
}

function add_load_previous()
{
  const inputElement = document.getElementById("input_previous");
  inputElement.addEventListener("change", handleFiles, false);
  
  function handleFiles() {
    for (let i = 0; i < this.files.length; i++) {
		var file = this.files[i];
		if (file) {
		  var reader = new FileReader();
		  reader.readAsText(file, "UTF-8");
		  reader.onload = function (evt) {
			  load_json_text_to_workspace(previous_workspace, evt.target.result)
			}
		  reader.onerror = function (evt) {
			  document.getElementById("error_previous").innerHTML = "error reading file";
		  }
		}
    }
  }
}

function add_load_mine()
{
  const inputElement = document.getElementById("input_mine");
  inputElement.addEventListener("change", handleFiles, false);
  
  function handleFiles() {
    for (let i = 0; i < this.files.length; i++) {
		var file = this.files[i];
		if (file) {
		  var reader = new FileReader();
		  reader.readAsText(file, "UTF-8");
		  reader.onload = function (evt) {
			  load_json_text_to_workspace(mine_workspace, evt.target.result)
			}
		  reader.onerror = function (evt) {
			  document.getElementById("error_mine").innerHTML = "error reading file";
		  }
		}
    }
  }
}


/**
 * @license
 * Copyright 2020 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Styling for workspace search.
 * @author aschmiedt@google.com (Abby Schmiedt)
 * @author kozbial@google.com (Monica Kozbial)
 */

/**
 * Base64 encoded data uri for close icon.
 * @type {string}
 */
 const CLOSE_SVG_DATAURI =
 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC' +
 '9zdmciIGhlaWdodD0iMTQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjE0Ij48cGF0aC' +
 'BkPSJNMTkgNi40MUwxNy41OSA1IDEyIDEwLjU5IDYuNDEgNSA1IDYuNDEgMTAuNTkgMTIgNS' +
 'AxNy41OSA2LjQxIDE5IDEyIDEzLjQxIDE3LjU5IDE5IDE5IDE3LjU5IDEzLjQxIDEyeiIvPj' +
 'xwYXRoIGQ9Ik0wIDBoMjR2MjRIMHoiIGZpbGw9Im5vbmUiLz48L3N2Zz4=';

/**
* Base64 encoded data uri for keyboard arrow down icon.
* @type {string}
*/
const ARROW_DOWN_SVG_DATAURI =
 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC' +
 '9zdmciIGhlaWdodD0iMTQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjE0Ij48cGF0aC' +
 'BkPSJNNy40MSA4LjU5TDEyIDEzLjE3bDQuNTktNC41OEwxOCAxMGwtNiA2LTYtNiAxLjQxLT' +
 'EuNDF6Ii8+PHBhdGggZD0iTTAgMGgyNHYyNEgwVjB6IiBmaWxsPSJub25lIi8+PC9zdmc+';

/**
* Base64 encoded data uri for keyboard arrow up icon.
* @type {string}
*/
const ARROW_UP_ARROW_SVG_DATAURI =
 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC' +
 '9zdmciIGhlaWdodD0iMTQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjE0Ij48cGF0aC' +
 'BkPSJNNy40MSAxNS40MUwxMiAxMC44M2w0LjU5IDQuNThMMTggMTRsLTYtNi02IDZ6Ii8+PH' +
 'BhdGggZD0iTTAgMGgyNHYyNEgweiIgZmlsbD0ibm9uZSIvPjwvc3ZnPg==';

/**
* CSS for workspace search.
* @type {Array.<string>}
*/
const CSS_CONTENT = [
/* eslint-disable indent */
'path.blocklyPath.blockly-ws-merge-highlight-mine-added {',
 'fill: lightgreen;',
'}',
'path.blocklyPath.blockly-ws-merge-highlight-mine-removed {',
 'fill: lightcoral;',
'}',
'.geras-renderer.classic-theme .blocklyEditableText>rect.blocklyFieldRect.blocklyInvalidInput {',
  'stroke: red;',
  'fill: #fff;',
'}',


'.blockly-ws-merge-highlight-value-changed {',
 'fill: purple;',
'}',
'path.blocklyPath.blockly-ws-merge-highlight.blockly-ws-merge-current {',
 'fill: grey;',
'}',
'.blockly-ws-merge-close-btn {',
 'background: url(' + CLOSE_SVG_DATAURI + ') no-repeat top left;',
'}',
'.blockly-ws-merge-next-btn {',
 'background: url(' + ARROW_DOWN_SVG_DATAURI + ') no-repeat top left;',
'}',
'.blockly-ws-merge-previous-btn {',
 'background: url(' +ARROW_UP_ARROW_SVG_DATAURI + ') no-repeat top left;',
'}',
'.blockly-ws-merge {',
 'background: white;',
 'border: solid lightgrey .5px;',
 'box-shadow: 0px 10px 20px grey;',
 'justify-content: center;',
 'padding: .25em;',
 'position: absolute;',
 'z-index: 70;',
'}',
'.blockly-ws-merge-input input {',
 'border: none;',
'}',
'.blockly-ws-merge button {',
 'border: none;',
'}',
'.blockly-ws-merge-actions {',
 'display: flex;',
'}',
'.blockly-ws-merge-container {',
 'display: flex;',
'}',
'.blockly-ws-merge-content {',
 'display: flex;',
'}',
/* eslint-enable indent */
];

/**
* Injects CSS for workspace merge.
*/
const injectMergeCss = (function() {
let executed = false;
return function() {
 // Only inject the CSS once.
 if (executed) {
   return;
 }
 executed = true;
 const text = CSS_CONTENT.join('\n');
 // Inject CSS tag at start of head.
 const cssNode = document.createElement('style');
 cssNode.id = 'blockly-ws-merge-style';
 const cssTextNode = document.createTextNode(text);
 cssNode.appendChild(cssTextNode);
 document.head.insertBefore(cssNode, document.head.firstChild);
};
})();

