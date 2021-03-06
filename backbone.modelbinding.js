// Backbone.ModelBinding v0.5.0
// [jbarnette] Added getAttributeValue, allowing values to come from functions.
// [cmorse]    Added mediate support
// [toots]     Added foo.bar.baz syntax for bound attributes
// [toots]     Added setAttribute, allowing to set values to set#{label}, if defined.
//
// Copyright (C)2011 Derick Bailey, Muted Solutions, LLC
// Distributed Under MIT Liscene
//
// Documentation and Full Licence Availabe at:
// http://github.com/derickbailey/backbone.modelbinding
//
// ----------------------------
// Backbone.ModelBinding
// ----------------------------
;(function(root){

var modelbinding = (function(Backbone, _, $) {
  var modelBinding = {
    version: "0.5.0",

    bind: function(view, options){
      view.modelBinder = new ModelBinder(view, options);
      view.modelBinder.bind();
    },

    unbind: function(view){
      if (view.modelBinder){
        view.modelBinder.unbind()
      }
    }
  };

  // pop attribute name from model. It takes, in order
  // of priority:
  // model[name] if defined and not a function
  // model[name]() if defined and a function
  // model.get(name) otherwise
  var popAttribute = function (model, name) {
    if (!_.isObject(model)) {
      return undefined; 
    }
    var value = model[name];
    if (value) {
      if (_.isFunction(value))
        value = value.apply(model)
    } else {
      if (model.get) {
        value = model.get(name);
      } else {
        return undefined;
      }
    }
    return value;
  }

  // This function is expected to return attributes
  // and not a whole model. This, if resulting
  // object is of type Backbone.Model, it pops
  // out its ID.

  var getAttributeValue = function(model, name) {
    var value = model;

    name = "" + name;

    names = name.split(".");
    
    _.each(names, function (name) { 
      value = popAttribute(value, name);
    });

    if (value instanceof Backbone.Model)
      value = value.id;

    return value;
  };

  var setAttributeValue = function (model, label, attribute) {
    var options = {};
    if (typeof attribute !== "undefined" && attribute !== null) {
      options[label] = attribute;
    } else {
      options = label;
    }

    _.each(options, function (attr, key) {
      label = "set" + key.charAt(0).toUpperCase() + key.slice(1);
      if (_.isFunction(model[label])) {
        model[label](attr);
        delete options[key];
      }
    });

    model.set(options);
  }

  var ModelBinder = function(view, options){
    this.config = new modelBinding.Configuration(options);
    this.modelBindings = [];
    this.elementBindings = [];

    this.bind = function(){
      var conventions = modelBinding.Conventions;
      for (var conventionName in conventions){
        if (conventions.hasOwnProperty(conventionName)){
          var conventionElement = conventions[conventionName];
          var handler = conventionElement.handler;
          var conventionSelector = conventionElement.selector;
          handler.bind.call(this, conventionSelector, view, view.model, this.config);
        }
      }
    };

    this.unbind = function(){
      // unbind the html element bindings
      _.each(this.elementBindings, function(binding){
        binding.element.unbind(binding.eventName, binding.callback);
      });

      // unbind the model bindings
      _.each(this.modelBindings, function(binding){
        binding.model.unbind(binding.eventName, binding.callback);
      });
    };

    this.registerModelBinding = function(model, attrName, callback){
      // bind the model changes to the form elements
      var eventName = "change:" + attrName;
      model.bind(eventName, callback);
      this.modelBindings.push({model: model, eventName: eventName, callback: callback});
    };

    this.registerDataBinding = function(model, eventName, callback){
      // bind the model changes to the elements
      
      model.bind(eventName, callback);
      this.modelBindings.push({model: model, eventName: eventName, callback: callback});
    };

    this.registerElementBinding = function(element, callback){
      // bind the form changes to the model
      element.bind("change", callback);
      this.elementBindings.push({element: element, eventName: "change", callback: callback});
    };
  };

  // ----------------------------
  // Model Binding Configuration
  // ----------------------------
  modelBinding.Configuration = function(options){
    this.bindingAttrConfig = {};

    _.extend(this.bindingAttrConfig, 
      modelBinding.Configuration.bindindAttrConfig,
      options
    );

    if (this.bindingAttrConfig.all){
      var attr = this.bindingAttrConfig.all;
      delete this.bindingAttrConfig.all;
      for (var inputType in this.bindingAttrConfig){
        if (this.bindingAttrConfig.hasOwnProperty(inputType)){
          this.bindingAttrConfig[inputType] = attr;
        }
      }
    }

    this.getBindingAttr = function(type){ 
      return this.bindingAttrConfig[type]; 
    };

    this.getBindingValue = function(element, type){
      var bindingAttr = this.getBindingAttr(type);
      return element.attr(bindingAttr);
    };

  };

  modelBinding.Configuration.bindindAttrConfig = {
    text: "id",
    textarea: "id",
    password: "id",
    radio: "name",
    checkbox: "id",
    select: "id",
    number: "id",
    range: "id",
    tel: "id",
    search: "id",
    url: "id",
    email: "id"
  };

  modelBinding.Configuration.store = function(){
    modelBinding.Configuration.originalConfig = _.clone(modelBinding.Configuration.bindindAttrConfig);
  };

  modelBinding.Configuration.restore = function(){
    modelBinding.Configuration.bindindAttrConfig = modelBinding.Configuration.originalConfig;
  };

  modelBinding.Configuration.configureBindingAttributes = function(options){
    if (options.all){
      this.configureAllBindingAttributes(options.all);
      delete options.all;
    }
    _.extend(modelBinding.Configuration.bindindAttrConfig, options);
  };

  modelBinding.Configuration.configureAllBindingAttributes = function(attribute){
    var config = modelBinding.Configuration.bindindAttrConfig;
    config.text = attribute;
    config.textarea = attribute;
    config.password = attribute;
    config.radio = attribute;
    config.checkbox = attribute;
    config.select = attribute;
    config.number = attribute;
    config.range = attribute;
    config.tel = attribute;
    config.search = attribute;
    config.url = attribute;
    config.email = attribute;
  };

  // ----------------------------
  // Text, Textarea, and Password Bi-Directional Binding Methods
  // ----------------------------
  var StandardBinding = (function(Backbone){
    var methods = {};

    var _getElementType = function(element) {
      var type = element[0].tagName.toLowerCase();
      if (type == "input"){
        type = element.attr("type");
        if (type == undefined || type == ''){
          type = 'text';
        }
      }
      return type;
    };

    methods.bind = function(selector, view, model, config){
      var modelBinder = this;

      view.$(selector).each(function(index){
        var element = view.$(this);
        var elementType = _getElementType(element);
        var attribute_name = config.getBindingValue(element, elementType);
        if (!attribute_name) return;
        var mediator = modelBinding.getMediator(element);

        var modelChange = function(changed_model, val) {
          element.val(mediator.render(val));
        };

        var popData = function (options, name) {
          var target;
          if (target = options.model[name]) {
            options.model = _.isFunction(target) ? target() : target
          } else {
            options.data[name] = options.model.get(name) || {};
            options.data = options.data[name];
          }
        }

        var setModelValue = function(attr_name, value){
          var origData = {};
          var options = { data: origData, model: model };

          attr_names = attr_name.split(".");
          attr_name  = attr_names.pop();

          _.each(attr_names, function (name) {
            popData(options, name);
          });

          options.data[attr_name] = mediator.parse(value);
          setAttributeValue(options.model, origData);
        };

        var elementChange = function(ev){
          setModelValue(attribute_name, view.$(ev.target).val());
        };

        modelBinder.registerModelBinding(model, attribute_name, modelChange);
        modelBinder.registerElementBinding(element, elementChange);

        // set the default value on the form, from the model
        var attr_value = getAttributeValue(model, attribute_name);
        if (typeof attr_value !== "undefined" && attr_value !== null) {
          element.val(mediator.render(attr_value));
        } else {
          var elVal = element.val();
          if (elVal){
            setModelValue(attribute_name, elVal);
          }
        }
      });
    };

    return methods;
  })(Backbone);

  // ----------------------------
  // Select Box Bi-Directional Binding Methods
  // ----------------------------
  var SelectBoxBinding = (function(Backbone){
    var methods = {};

    methods.bind = function(selector, view, model, config){
      var modelBinder = this;

      view.$(selector).each(function(index){
        var element = view.$(this);
        var attribute_name = config.getBindingValue(element, 'select');
        if (!attribute_name) return;

        var modelChange = function(changed_model, val){ element.val(val); };

        var popData = function (options, name) {
          var target;
          if (target = options.model[name]) {
            options.model = _.isFunction(target) ? target() : target
          } else {
            options.data[name] = options.model.get(name) || {};
            options.data = options.data[name];
          }
        }

        var setModelValue = function(attr_name, val, text){
          var origData = {};
          var options = { data: origData, model: model };

          attr_names = attr_name.split(".");
          attr_name  = attr_names.pop();

          _.each(attr_names, function (name) {
            popData(options, name);
          });

          options.data[attr_name] = val;
          options.data[attr_name + "_text"] = text;
          setAttributeValue(options.model, origData);
        };

        var elementChange = function(ev){
          var targetEl = view.$(ev.target);
          var value = targetEl.val();
          var text = targetEl.find(":selected").text();
          setModelValue(attribute_name, value, text);
        };

        modelBinder.registerModelBinding(model, attribute_name, modelChange);
        modelBinder.registerElementBinding(element, elementChange);

        // set the default value on the form, from the model
        var attr_value = getAttributeValue(model, attribute_name);
        if (typeof attr_value !== "undefined" && attr_value !== null) {
          element.val(attr_value);
        } else {
          // set the model to the form's value if there is no model value
          var value = element.val();
          var text = element.find(":selected").text();
          setModelValue(attribute_name, value, text);
        }
      });
    };

    return methods;
  })(Backbone);

  // ----------------------------
  // Radio Button Group Bi-Directional Binding Methods
  // ----------------------------
  var RadioGroupBinding = (function(Backbone){
    var methods = {};

    methods.bind = function(selector, view, model, config){
      var modelBinder = this;

      var foundElements = [];
      view.$(selector).each(function(index){
        var element = view.$(this);

        var group_name = config.getBindingValue(element, 'radio');
        if (!foundElements[group_name]) {
          foundElements[group_name] = true;
          var bindingAttr = config.getBindingAttr('radio');

          var modelChange = function(model, val){
            var value_selector = "input[type=radio][" + bindingAttr + "='" + group_name + "'][value='" + val + "']";
            view.$(value_selector).attr("checked", "checked");
          };
          modelBinder.registerModelBinding(model, group_name, modelChange);

          var setModelValue = function(attr, val){
            var data = {};
            data[attr] = val;
            setAttributeValue(model, data);
          };

          // bind the form changes to the model
          var elementChange = function(ev){
            var element = view.$(ev.currentTarget);
            if (element.is(":checked")){
              setModelValue(group_name, element.val());
            }
          };

          var group_selector = "input[type=radio][" + bindingAttr + "='" + group_name + "']";
          view.$(group_selector).each(function(){
            var groupEl = $(this);
            modelBinder.registerElementBinding(groupEl, elementChange);
          });

          var attr_value = getAttributeValue(model, group_name);
          if (typeof attr_value !== "undefined" && attr_value !== null) {
            // set the default value on the form, from the model
            var value_selector = "input[type=radio][" + bindingAttr + "='" + group_name + "'][value='" + attr_value + "']";
            view.$(value_selector).attr("checked", "checked");
          } else {
            // set the model to the currently selected radio button
            var value_selector = "input[type=radio][" + bindingAttr + "='" + group_name + "']:checked";
            var value = view.$(value_selector).val();
            setModelValue(group_name, value);
          }
        }
      });
    };

    return methods;
  })(Backbone);

  // ----------------------------
  // Checkbox Bi-Directional Binding Methods
  // ----------------------------
  var CheckboxBinding = (function(Backbone){
    var methods = {};

    methods.bind = function(selector, view, model, config){
      var modelBinder = this;

      view.$(selector).each(function(index){
        var element = view.$(this);
        var bindingAttr = config.getBindingAttr('checkbox');
        var attribute_name = config.getBindingValue(element, 'checkbox');

        if (!attribute_name) return;
        
        var modelChange = function(model, val){
          if (val){
            element.attr("checked", "checked");
          }
          else{
            element.removeAttr("checked");
          }
        };

        var setModelValue = function(attr_name, value){
          var data = {};
          data[attr_name] = value;
          setAttributeValue(model, data);
        };

        var elementChange = function(ev){
          var changedElement = view.$(ev.target);
          var checked = changedElement.is(":checked")? true : false;
          setModelValue(attribute_name, checked);
        };

        modelBinder.registerModelBinding(model, attribute_name, modelChange);
        modelBinder.registerElementBinding(element, elementChange);

        var attr_value = getAttributeValue(model, attribute_name);
        if (typeof attr_value !== "undefined" && attr_value !== null) {
          // set the default value on the form, from the model
          if (typeof attr_value !== "undefined" && attr_value !== null && attr_value != false) {
            element.attr("checked", "checked");
          }
          else{
            element.removeAttr("checked");
          }
        } else {
          // bind the form's value to the model
          var checked = element.is(":checked")? true : false;
          setModelValue(attribute_name, checked);
        }
      });
    };

    return methods;
  })(Backbone);

  // ----------------------------
  // Data-Bind Binding Methods
  // ----------------------------
  var DataBindBinding = (function(Backbone, _, $){
    var dataBindSubstConfig = {
      "default": ""
    };

    modelBinding.Configuration.dataBindSubst = function(config){
      this.storeDataBindSubstConfig();
      _.extend(dataBindSubstConfig, config);
    };

    modelBinding.Configuration.storeDataBindSubstConfig = function(){
      modelBinding.Configuration._dataBindSubstConfig = _.clone(dataBindSubstConfig);
    };

    modelBinding.Configuration.restoreDataBindSubstConfig = function(){
      if (modelBinding.Configuration._dataBindSubstConfig){
        dataBindSubstConfig = modelBinding.Configuration._dataBindSubstConfig;
        delete modelBinding.Configuration._dataBindSubstConfig;
      }
    };

    modelBinding.Configuration.getDataBindSubst = function(elementType, value){
      var returnValue = value;
      if (value === undefined){
        if (dataBindSubstConfig.hasOwnProperty(elementType)){
          returnValue = dataBindSubstConfig[elementType];
        } else {
          returnValue = dataBindSubstConfig["default"];
        }
      }
      return returnValue;
    };

    var setOnElement = function(element, attr, val){
      var valBefore = val;
      val = modelBinding.Configuration.getDataBindSubst(attr, val);
      val = modelBinding.getMediator(element).render(val);
      switch(attr){
        case "html":
          element.html(val);
          break;
        case "text":
          element.text(val);
          break;
        case "enabled":
          element.attr("disabled", !val);
          break;
        case "displayed":
          element[val? "show" : "hide"]();
          break;
        case "hidden":
          element[val? "hide" : "show"]();
          break;
        default:
          element.attr(attr, val);
      }
    };

    var splitBindingAttr = function(element)
    {
      var dataBindConfigList = [];
      var dataBindAttributeName = modelBinding.Conventions.databind.selector.replace(/^(.*\[)([^\]]*)(].*)/g, '$2');
      var databindList = element.attr(dataBindAttributeName).split(";");
      _.each(databindList, function(attrbind){
        var databind = $.trim(attrbind).split(" ");

        // make the default special case "text" if none specified
        if( databind.length == 1 ) databind.unshift("text");

        dataBindConfigList.push({
          elementAttr: databind[0],
          modelAttr: databind[1]
        });
      });
      return dataBindConfigList;
    };

    var getEventConfiguration = function(element, databind){
      var config = {};
      var eventName = databind.modelAttr;
      var index = eventName.indexOf("event:");

      if (index == 0) {
        // "event:foo" binding
        config.name = eventName.substr(6);
        config.callback = function(val){
          setOnElement(element, databind.elementAttr, val);
        };
      } else {
        // standard model attribute binding
        config.name = "change:" + eventName;
        config.callback = function(model, val){
          setOnElement(element, databind.elementAttr, val);
        };
      }

      return config;
    }
    var methods = {};

    methods.bind = function(selector, view, model, config){
      var modelBinder = this;

      view.$(selector).each(function(index){
        var element = view.$(this);
        var databindList = splitBindingAttr(element);

        _.each(databindList, function(databind){
          var eventConfig = getEventConfiguration(element, databind);
          modelBinder.registerDataBinding(model, eventConfig.name, eventConfig.callback);

          // set default on data-bind element
          setOnElement(element, databind.elementAttr, getAttributeValue(model, databind.modelAttr));
        });

      });
    };

    return methods;
  })(Backbone, _, $);


  // ----------------------------
  // Binding Conventions
  // ----------------------------
  modelBinding.Conventions = {
    text: {selector: "input:text", handler: StandardBinding},
    textarea: {selector: "textarea", handler: StandardBinding},
    password: {selector: "input:password", handler: StandardBinding},
    radio: {selector: "input:radio", handler: RadioGroupBinding},
    checkbox: {selector: "input:checkbox", handler: CheckboxBinding},
    select: {selector: "select", handler: SelectBoxBinding},
    databind: { selector: "*[data-bind]", handler: DataBindBinding},
    // HTML5 input
    number: {selector: "input[type=number]", handler: StandardBinding},
    range: {selector: "input[type=range]", handler: StandardBinding},
    tel: {selector: "input[type=tel]", handler: StandardBinding},
    search: {selector: "input[type=search]", handler: StandardBinding},
    url: {selector: "input[type=url]", handler: StandardBinding},
    email: {selector: "input[type=email]", handler: StandardBinding}
  };

  modelBinding.Mediators = {}

  modelBinding.getMediator = function(element) {
    var mediator = modelBinding.Mediators[$(element).attr("data-mediator")] || {};

    mediator.parse = mediator.parse || function(t) { return t; }
    mediator.render = mediator.render || function(t) { return t; }
    return mediator;
  }
  
  return modelBinding;
});

// Backbone.Modelbinding AMD wrapper with namespace fallback
if (typeof define === 'function' && define.amd) {
    // AMD support
    define([
      'backbone',    // use Backbone 0.5.3-optamd3 branch (https://github.com/jrburke/backbone/tree/optamd3)
      'underscore',  // AMD supported
      'jquery'       // AMD supported
      ], function (Backbone, _, jQuery) {
        return modelbinding(Backbone, _, jQuery);
      });
} else {
    // No AMD, use Backbone namespace
    root.Backbone = Backbone || {};
    root.Backbone.ModelBinding = modelbinding(Backbone, _, jQuery);
}

})(this);
