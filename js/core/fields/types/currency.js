(function(global){
  "use strict";
  const fallbackCurrencies=["AUD","CAD","CHF","CNY","EUR","GBP","INR","JPY","NZD","USD"];
  const currencyCodes=typeof Intl.supportedValuesOf==="function"
    ?Intl.supportedValuesOf("currency")
    :fallbackCurrencies;
  const currencyNames=typeof Intl.DisplayNames==="function"
    ?new Intl.DisplayNames(undefined,{type:"currency"})
    :null;
  const currencyOptions=currencyCodes.map(value=>({
    value,
    label:`${value} - ${currencyNames?.of(value)||value}`
  }));
  const decimalPlaceOptions=[
    {value:"",label:"Currency default"},
    ...Array.from({length:7},(_,places)=>({value:String(places),label:String(places)}))
  ];

  global.BeforeworkFieldTypes.register({
    value:"currency",label:"Currency",description:"Store and display a monetary amount.",
    inputType:"number",
    getDisplayLabel:({field})=>`${field.label} (${field.currency||"USD"})`,
    getSummaryMetadata:({field})=>({
      currency:field.currency||"USD",
      ...(field.decimalPlaces!==undefined?{decimalPlaces:field.decimalPlaces}:{})
    }),
    validateField:({field,path})=>{
      const errors=[];
      if (typeof field.currency!=="string"||!/^[A-Z]{3}$/.test(field.currency)){
        errors.push(`${path}.currency must be a three-letter uppercase currency code.`);
      } else if (!currencyCodes.includes(field.currency)){
        errors.push(`${path}.currency must be a supported currency code.`);
      }
      if (field.decimalPlaces!==undefined&&(!Number.isInteger(field.decimalPlaces)||field.decimalPlaces<0||field.decimalPlaces>6)){
        errors.push(`${path}.decimalPlaces must be an integer from 0 to 6.`);
      }
      return errors;
    },
    getSettings:({field})=>[
      {
        label:"Currency",type:"select",options:currencyOptions,
        value:field?.currency||"USD"
      },
      {
        label:"Decimal places",type:"select",options:decimalPlaceOptions,
        value:field?.decimalPlaces==null?"":String(field.decimalPlaces)
      }
    ],
    applySettings:({field,values})=>{
      const [currency,decimalPlaces]=values||[];
      if (!currencyCodes.includes(currency)){
        throw new TypeError("Choose a supported currency.");
      }
      field.currency=currency;
      if (decimalPlaces==="") delete field.decimalPlaces;
      else {
        const places=Number(decimalPlaces);
        if (!Number.isInteger(places)||places<0||places>6){
          throw new TypeError("Decimal places must be between 0 and 6.");
        }
        field.decimalPlaces=places;
      }
    },
    filter:{
      kind:"number",
      getValues:({value,noneValue="__none__"})=>value==null||value===""?[noneValue]:[String(value)],
      matches:({value,mode,noneValue="__none__"})=>{
        const selected=Array.isArray(mode)?mode:[mode];
        if (!selected.length||selected.includes("__all__")) return true;
        if (value==null||value==="") return selected.includes(noneValue);
        return selected.some(selectedValue=>selectedValue!==noneValue&&Number.isFinite(Number(value))&&Number(value)===Number(selectedValue));
      }
    },
    normalizeInput:({input})=>input.value===""?"":Number(input.value),
    sortValue:({value})=>{
      if (value===""||value==null) return Number.POSITIVE_INFINITY;
      const number=Number(value);
      return Number.isFinite(number)?number:Number.POSITIVE_INFINITY;
    },
    formatValue:({value,field})=>{
      if (value==null||value==="") return "";
      if (!Number.isFinite(Number(value))) return String(value);
      const currency=field.currency||"USD";
      const options={style:"currency",currency};
      if (Number.isInteger(field.decimalPlaces)&&field.decimalPlaces>=0&&field.decimalPlaces<=6){
        options.minimumFractionDigits=field.decimalPlaces;
        options.maximumFractionDigits=field.decimalPlaces;
      }
      return new Intl.NumberFormat(undefined,options).format(Number(value));
    }
  });
})(window);
