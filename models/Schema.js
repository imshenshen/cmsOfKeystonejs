var keystone = require('keystone');
var Types = keystone.Field.Types;
var _ = require("lodash");
var spawn = require('child_process').spawn;
var restful = require('restful-keystone')(keystone);
var Schema = new keystone.List('Schema',{
	label: '模型设置'
});
var ObjectId = keystone.mongoose.Types.ObjectId;
Schema.add({
		name: { type: String, required: true, label: "模型名称" },
		modelId: { type: String, required: true, label: "模型ID", unique: true, initial: true }
	},
	'模型配置',
	{
		initConfig: {
			sortable: { type: Types.Boolean, label: "可排序" },
			defaultSort: { type: String, label: '默认排序列' },
			defaultColumns: { type: String, label: '显示列', note: '哪些key会在admin列表中显示出来' },
			//map:{type:Types.Code,collapse:true,height:10,language:'json'},
			autokey: { type: String },
			drilldown: { type: String }
		}
	},
	'字段配置',
	{
		fieldCode: { type: Types.Code, height: 180, language: 'json' }
	},
	'其他代码',
	{
		otherCode: { type: Types.Code, language: 'javascript' }
	});


Schema.register();

Schema.schema.post('save',function(){
	//loadSchema(doc, keystone.list(doc.modelId));
	spawn("pm2",["restart","keystone"]);
});
var dealType = function(obj){
	var keys = Object.keys(obj);
	for (var i = 0, len = keys.length; i < len; i++) {
		var key = keys[i];
		if(_.isObject(obj[key]) && (!obj[key].constructor || obj[key].constructor.name === 'Object') ){
			if(!obj[key].type || obj[key].type.type){
				dealType(obj[key]);
			}else{
				obj[key].type = Types[obj[key].type] || eval(obj[key].type);
			}
		}
	}
}
var exposeConfig = {
	Permission:true
};
var beforeConfig = {};
exposeConfig.Schema = true;
exposeConfig.Post = true;

Schema.model.find().exec(function(err, data){
	_.forEach(data,function(config){
		try {
			loadSchema(config);
		} catch (e) {
			/* handle error */
			console.log(e);
		}
	});
	console.log(exposeConfig);
	restful.expose(exposeConfig).before(beforeConfig).start();
});
function loadSchema(config,schema){
	var tempSchema;
	if(schema){
		tempSchema = schema;
	} else{
		var initConfig = config.initConfig;

		initConfig.label = config.name;
		initConfig.map = initConfig.map&&JSON.parse(initConfig.map);
		tempSchema = new keystone.List(config.modelId,initConfig);
	}
	var cc = JSON.parse(config.fieldCode);
	dealType(cc);
	tempSchema.add(cc);
	if(config.otherCode){
		console.log('执行[ %s ]其他代码',config.name);
		(function(Schema){
			eval(config.otherCode);
		})(tempSchema);
		console.log('执行[ %s ]其他代码完毕',config.name);
	}
	tempSchema.register();
	exposeConfig[config.modelId] = {
		envelop:"result",
		populate: true
	};
	beforeConfig[config.modelId] = (function(modelId){
		return function(req,res,next){
			var roleList = [];
			if(req.user){
				roleList = req.user.roles;
			}
			keystone.list("Schema").model.findOne({modelId:modelId},function(err,schema){
				keystone.list("Permission").model.findOne({listName:schema._id}).exec(function(err,permission){
					console.log(roleList);
					roleList = roleList.toString().split(",");
					var perList = permission.read.toString().split(",");

					if(_.uniq(roleList.concat(perList)).length < (roleList.length + perList.length)){
						next();
					}else{
						res.send("你没有权限");
					}
				});
			});

		}
	})(config.modelId);
}
