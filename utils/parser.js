function parse(messages, title = "Prueba") {

    let fulltext = `### Archived Thread: ${title}\n\n -------------------- \n\n `;

    for (let message of messages) {

        let dialogName = `**${message.user.icon_assigned} ${message.user.name} <${message.user.profile.real_name}>** says: `
        let text = handleMessage(message);
        let images = message.files.map(handleImageType).join("\n\n")
        fulltext = fulltext + dialogName + "\n  " + text + (!!images ? "\n  " + images : "") + "\n\n";
    }

    return fulltext;
};


let handleMessage = (message) => {

    let messageText = "";

    // "mensajes de bot no tienen block"
    if (!!message.blocks) {

        for (let block of message.blocks) {
            let text = handlerBlockType(block.type)(block);
            messageText = messageText + " " + text;
        }
    }

    return messageText;
}


let handlerBlockType = (type) => {

    let handler = {
        ["rich_text"]: handlerRichText,
        ["rich_text_list"]: handlerRichTextList,
        ["rich_text_section"]: handlerRichTextSection,
        ["rich_text_preformatted"]: handleRichTextPreformatted,
        ["rich_text_quote"]: handlerRichTextQuote,

        ["text"]: handleTextType,
        ["link"]: handleLinkType,
        ["user"]: handleUserType

    }

    return handler[type] || (() => { });
}

let handlerRichText = (block) => block.elements.map(e => handlerBlockType(e.type)(e)).join(" ")

let handlerRichTextSection = (block) => block.elements.map(e => handlerBlockType(e.type)(e)).join(" ")

let handlerRichTextList = (block) => {
    let style = "* "
    return block.elements.map(e => style + handlerBlockType(e.type)(e)).join("\n");
}

let handleRichTextPreformatted = (block) => {
    return "```\n" + block.elements.map(e => handlerBlockType(e.type)(e)).join(" ") + "\n```\n\n";
}

let handlerRichTextQuote = (block) => {
    return block.elements.map(e => "> " + handlerBlockType(e.type)(e)).join(" ");
}

// ==============================================

let handleStyle = (element) => {
    let wrap = ""

    if (!!element["style"]) {
        if (element.style["bold"]) {
            wrap += "**";
        }

        if (element.style["code"]) {
            wrap += "```";
        }

        if (element.style["strike"]) {
            wrap += '~';
        }

        if (element.style["italic"]) {
            wrap += '__';
        }
    }

    return wrap;
}

let handleTextType = (element) => {
    let wrap = handleStyle(element);

    return wrap + element.text + wrap.split("").reverse().join("");
}

let handleLinkType = (element) => {
    let wrap = handleStyle(element);

    return wrap + `[${element.text}](${element.url})` + wrap.split("").reverse().join("");
}

let handleUserType = (element) => {

    let icon = ""
    if (element.user.is_bot) {
        icon = ":robot:"
    } else {
        icon = element.user.icon_assigned;
    }

    if (element.user.name == "loscalzo.jony") {
        icon = ":beers:";
    }

    return `${icon} __${element.user.name}__`;
}

let handleImageType = (element) => {
    return `![](${element.imgurl})`;
}

module.exports = parse;