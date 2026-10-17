const API=window.API_BASE_URL;
const $=(id)=>document.getElementById(id);
const note=(message,error=false)=>{$("notice").textContent=message;$("notice").className="status"+(error?" error":"");};
const choices=[["internship","Internship"],["full-time","Full-time"],["contract","Contract"]];
$("availability").innerHTML=choices.map(([v,l])=>'<label class="choice"><input type="checkbox" name="availability" value="'+v+'">'+l+'</label>').join("");
async function call(path,options={}){const response=await fetch(API+"/api"+path,{credentials:"include",...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});let data={};try{data=await response.json()}catch{}if(!response.ok)throw new Error(data.error||"Request failed ("+response.status+")");return data}
function readProfile(){return {name:$("name").value.trim(),headline:$("headline").value.trim(),program:$("program").value.trim(),biography:$("biography").value.trim(),location:$("location").value.trim(),show_availability:$("showAvailability").checked,show_links:$("showLinks").checked,availability:[...document.querySelectorAll('input[name="availability"]:checked')].map(x=>x.value),skills:[...document.querySelectorAll('input[name="skill"]:checked')].map(x=>x.value),links:{Portfolio:$("portfolio").value.trim(),GitHub:$("github").value.trim()}}}
function fillProfile(p={}){for(const key of ["name","headline","program","biography","location"])$(key).value=p[key]||"";$("#showAvailability").checked=p.show_availability!==false;$("#showLinks").checked=p.show_links!==false;for(const input of document.querySelectorAll('input[name="availability"]'))input.checked=(p.availability||[]).includes(input.value);for(const input of document.querySelectorAll('input[name="skill"]'))input.checked=(p.skills||[]).includes(input.value);$("portfolio").value=p.links?.Portfolio||"";$("github").value=p.links?.GitHub||""}
function escapeHTML(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function loadSkills(){const response=await fetch(API+"/api/skills");if(!response.ok)throw new Error("Could not load shared skills");const skills=await response.json();$("skills").innerHTML=skills.map(s=>'<label class="choice"><input type="checkbox" name="skill" value="'+escapeHTML(s)+'">'+escapeHTML(s)+'</label>').join("")}
async function start(){const signIn=$("signedOut"),verify=$("verification"),editor=$("editor");$("signIn").href=API+"/api/auth/github";try{const me=await call("/auth/me");signIn.hidden=true;if(!me.verified){verify.hidden=false;editor.hidden=true;note("Signed in as @"+me.github_login+". Verify your Algoma email to continue.");return}verify.hidden=true;editor.hidden=false;await loadSkills();const p=await call("/profile");fillProfile(p.profile);note("Signed in and verified as "+me.email+". Your profile is "+(p.published?"published":"private")+"." );$("unpublish").hidden=!p.published}catch(e){if(e.message.includes("Sign in")||e.message.includes("401")){signIn.hidden=false;verify.hidden=true;editor.hidden=true;note("Sign in with GitHub to manage your profile.")}else{signIn.hidden=true;note(e.message,true)}}}
$("sendCode").onclick=async()=>{try{const data=await call("/affiliation/request",{method:"POST",body:JSON.stringify({email:$("email").value})});$("codePanel").hidden=false;note(data.message)}catch(e){note(e.message,true)}};
$("verifyCode").onclick=async()=>{try{await call("/affiliation/verify",{method:"POST",body:JSON.stringify({code:$("code").value})});note("Email verified. Loading your private profile…");await start()}catch(e){note(e.message,true)}};
$("save").onclick=async()=>{try{await call("/profile",{method:"PUT",body:JSON.stringify(readProfile())});note("Private draft saved.")}catch(e){note(e.message,true)}};
$("preview").onclick=()=>{const p=readProfile();const links=p.show_links?Object.entries(p.links).map(([label,url])=>"<p>"+escapeHTML(label)+": "+escapeHTML(url)+"</p>").join(""):"<p>Professional links are private.</p>";const availability=p.show_availability?escapeHTML(p.availability.join(", ")):"Hidden";$("previewContent").innerHTML="<p><strong>Public preview</strong></p><h3>"+escapeHTML(p.name)+"</h3><p><strong>"+escapeHTML(p.headline)+"</strong></p><p>"+escapeHTML(p.program)+"</p><p>"+escapeHTML(p.location)+"</p><p>"+escapeHTML(p.biography)+"</p><p>Availability: "+availability+"</p><p>Skills: "+escapeHTML(p.skills.join(" · "))+"</p>"+links;$("previewPanel").hidden=false;$("previewPanel").scrollIntoView({behavior:"smooth"})};
$("publish").onclick=async()=>{try{await call("/profile",{method:"PUT",body:JSON.stringify(readProfile())});const result=await call("/profile/publish",{method:"POST",body:"{}"});note("Profile published. Public profile: "+result.url);$("unpublish").hidden=false}catch(e){note(e.message,true)}};
$("unpublish").onclick=async()=>{try{await call("/profile/unpublish",{method:"POST",body:"{}"});note("Profile unpublished. It no longer appears in the public directory.");$("unpublish").hidden=true}catch(e){note(e.message,true)}};
$("logout").onclick=async()=>{try{await call("/auth/logout",{method:"POST",body:"{}"});location.reload()}catch(e){note(e.message,true)}};
function addResumeCandidate(kind,value){
  if(!value)return;
  const card=document.createElement("div");card.className="resume-candidate panel";
  const label=document.createElement("label");label.className="choice";
  const check=document.createElement("input");check.type="checkbox";check.name="resumeCandidate";check.dataset.kind=kind;
  label.append(check,document.createTextNode("Select "+kind+" candidate"));
  const edit=document.createElement("textarea");edit.value=value;edit.setAttribute("aria-label","Edit "+kind+" candidate");edit.rows=2;
  card.append(label,edit);$("suggestionItems").append(card);
}
$("applyResumeSuggestions").onclick=()=>{
  const selected=[...document.querySelectorAll('input[name="resumeCandidate"]:checked')];
  let applied=0,unmatched=0;
  for(const check of selected){
    const card=check.closest(".resume-candidate"),value=card.querySelector("textarea").value.trim(),kind=check.dataset.kind;
    if(!value)continue;
    if(kind==="skill"){const target=[...document.querySelectorAll('input[name="skill"]')].find(x=>x.value.toLocaleLowerCase()===value.toLocaleLowerCase());if(target){target.checked=true;applied++}else unmatched++}
    else if(kind==="education"){$("program").value=value;applied++}
    else if(kind==="experience"){$("biography").value=$("biography").value.trim()?$("biography").value.trim()+"\n"+value:value;applied++}
    else if(kind==="link"){
      let url=value.replace(/[.,;)]*$/,"");
      if(!/^https:\/\//i.test(url)){if(/^(www\.|github\.com\/|linkedin\.com\/)/i.test(url))url="https://"+url;else{unmatched++;continue}}
      try{const parsed=new URL(url);if(parsed.protocol!=="https:"){unmatched++;continue}const field=/github\.com$/i.test(parsed.hostname)?$("github"):$("portfolio");field.value=url;applied++}catch{unmatched++}
    }
  }
  $("resumeSuggestions").hidden=true;
  note(applied?applied+" selected resume candidate(s) applied. Review the fields and save when ready."+(unmatched?" "+unmatched+" candidate(s) need manual review.":""):(unmatched?"No selected candidate matched a shared skill or safe link; review it manually.":"No suggestions selected."));
};
$("resume").onchange=async(event)=>{
  const file=event.target.files?.[0];if(!file)return;
  $("resumeSuggestions").hidden=true;$("suggestionItems").replaceChildren();
  if(file.type!=="application/pdf"){note("Choose a PDF resume.",true);return}
  if(file.size>10*1024*1024){$("resumeStatus").textContent="This PDF is larger than the 10 MB import limit. You can enter profile details manually.";note("Resume is too large to import.",true);return}
  $("resumeStatus").textContent="Reading PDF locally…";
  try{
    const pdfjs=await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";
    const pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;
    let text="";
    for(let n=1;n<=Math.min(pdf.numPages,8);n++){const page=await pdf.getPage(n);const content=await page.getTextContent();text+=content.items.map(item=>item.str+(item.hasEOL?"\n":" ")).join("")}
    const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line.length>3);
    const availableSkills=[...document.querySelectorAll('input[name="skill"]')].map(input=>input.value);
    const matchedSkills=availableSkills.filter(skill=>text.toLocaleLowerCase().includes(skill.toLocaleLowerCase()));
    const education=lines.filter(line=>/\b(university|college|bsc|bachelor|education|computer science)\b/i.test(line)&&!/^(education|skills)$/i.test(line)).slice(0,4);
    const experience=lines.filter(line=>/\b(experience|assistant|intern|developer|built|worked|conducted|prototype|research)\b/i.test(line)&&!/^(experience|work experience)$/i.test(line)).slice(0,5);
    const links=[...new Set((text.match(/(?:https?:\/\/|www\.)[^\s|]+|(?:github\.com|linkedin\.com)\/[^\s|]+/gi)||[]).map(link=>link.replace(/[.,;)]*$/,"")))].slice(0,8);
    matchedSkills.forEach(value=>addResumeCandidate("skill",value));
    education.forEach(value=>addResumeCandidate("education",value));
    experience.forEach(value=>addResumeCandidate("experience",value));
    links.forEach(value=>addResumeCandidate("link",value));
    const count=matchedSkills.length+education.length+experience.length+links.length;
    $("resumeStatus").textContent=count?"PDF text was read locally. Review or edit each candidate before selecting Apply; no profile fields changed. Only the first eight pages are read.":"PDF text was read locally, but no supported candidates were found. Continue manually.";
    $("resumeSuggestions").hidden=!count;
    note("Resume processed in this browser. Extracted text is not stored or sent to the server.");
  }catch(error){
    $("resumeStatus").textContent="Could not read this PDF. You can still complete the form manually.";
    note("Resume import failed; your draft was not changed.",true);
  }
};
start();